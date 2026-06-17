from __future__ import annotations

import http.cookiejar
import json
import os
import re
import shutil
import subprocess
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass, fields
from pathlib import Path
from typing import Any, Iterable

try:
    from PIL import Image
except Exception:  # pragma: no cover
    Image = None

DEFAULT_APP_NAME = "Akademik Berkarakter"
DEFAULT_APP_ID = "id.sch.man1rokanhulu.absensi"
DEFAULT_SERVER = "https://absensi.man1rokanhulu.cloud"


def find_default_project_dir() -> str:
    """Find apps/android-reader even when builder is opened from tools/apk-builder."""
    candidates: list[Path] = [Path.cwd() / "apps/android-reader"]
    here = Path(__file__).resolve()
    for parent in here.parents:
        candidates.append(parent / "apps/android-reader")
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)
    return "apps/android-reader"


DEFAULT_PROJECT_DIR = find_default_project_dir()


def _parse_java_major(version_output: str) -> int | None:
    match = re.search(r'version\s+"([^"]+)"', version_output)
    if not match:
        return None
    value = match.group(1)
    if value.startswith("1."):
        parts = value.split(".")
        return int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else None
    first = re.match(r"(\d+)", value)
    return int(first.group(1)) if first else None


def _home_candidates() -> list[Path]:
    home = Path.home()
    candidates: list[Path] = [
        home / ".local/jdks/jdk-17",
        home / ".local/jdks/jdk-21",
        home / "android-studio/jbr",
        home / "Android Studio/jbr",
        home / ".jdks/jdk-17",
        home / ".jdks/jdk-21",
    ]
    candidates.extend(sorted((home / ".gradle/jdks").glob("*")) if (home / ".gradle/jdks").exists() else [])
    candidates.extend(sorted(Path("/usr/lib/jvm").glob("*")) if Path("/usr/lib/jvm").exists() else [])
    return candidates


def java_home_info(java_home: Path) -> tuple[int | None, str]:
    java_bin = java_home / "bin" / ("java.exe" if os.name == "nt" else "java")
    if not java_bin.exists():
        return None, "java tidak ditemukan"
    try:
        result = subprocess.run([str(java_bin), "-version"], capture_output=True, text=True, timeout=8)
        text = (result.stderr or result.stdout).strip()
        return _parse_java_major(text), text.splitlines()[0] if text else "versi tidak terbaca"
    except Exception as exc:
        return None, f"gagal dicek: {exc}"


def find_usable_jdk() -> Path | None:
    seen: set[Path] = set()
    candidates: list[Path] = []
    if os.environ.get("JAVA_HOME"):
        candidates.append(Path(os.environ["JAVA_HOME"]).expanduser())
    candidates.extend(_home_candidates())

    supported: list[tuple[int, Path]] = []
    for raw in candidates:
        path = raw.expanduser()
        if path in seen:
            continue
        seen.add(path)
        major, _ = java_home_info(path)
        if major in {17, 21}:
            supported.append((major, path.resolve()))
    for wanted in (17, 21):
        for major, path in supported:
            if major == wanted:
                return path
    return None


def find_android_sdk() -> Path | None:
    candidates: list[Path] = []
    for key in ("ANDROID_HOME", "ANDROID_SDK_ROOT"):
        if os.environ.get(key):
            candidates.append(Path(os.environ[key]).expanduser())
    home = Path.home()
    candidates.extend([home / "Android/Sdk", home / "Library/Android/sdk"])
    if os.name == "nt" and os.environ.get("LOCALAPPDATA"):
        candidates.append(Path(os.environ["LOCALAPPDATA"]) / "Android" / "Sdk")
    for path in candidates:
        if path.exists() and (path / "platforms").exists():
            return path.resolve()
    return None


@dataclass
class BuildProfile:
    app_display_name: str = DEFAULT_APP_NAME
    application_id: str = DEFAULT_APP_ID
    server_base_url: str = DEFAULT_SERVER
    version_name: str = "1.1.1"
    version_code: int = 3
    build_type: str = "debug"
    icon_file: str = ""
    output_dir: str = ""
    project_dir: str = DEFAULT_PROJECT_DIR
    keystore_file: str = ""
    key_alias: str = "schoolhub"
    store_password: str = ""
    key_password: str = ""
    save_passwords: bool = False
    download_url: str = ""
    release_notes: str = "APK Android QR Reader Akademik Berkarakter."
    min_supported_version_code: int = 1
    force_update: bool = False


@dataclass
class DependencyStatus:
    key: str
    ok: bool
    title: str
    message: str
    fix: str = ""


@dataclass
class ServerConnectionResult:
    ok: bool
    base_url: str
    health_ok: bool
    version_ok: bool
    message: str
    version_metadata: dict[str, Any] | None = None


class ApkBuilderCore:
    def __init__(self, profile: BuildProfile):
        self.profile = profile
        self.project = self.resolve_project_dir(profile.project_dir)

    @staticmethod
    def resolve_project_dir(value: str) -> Path:
        raw = Path(value or DEFAULT_PROJECT_DIR).expanduser()
        if raw.is_absolute() and raw.exists():
            return raw.resolve()
        if raw.exists():
            return raw.resolve()
        guessed = Path(find_default_project_dir()).expanduser()
        if guessed.exists() and raw.as_posix().endswith("apps/android-reader"):
            return guessed.resolve()
        return raw.resolve()

    @staticmethod
    def slug(text: str) -> str:
        value = re.sub(r"[^A-Za-z0-9]+", "-", text).strip("-")
        return value or "AkademikBerkarakter-APK"

    @staticmethod
    def normalize_server_url(url: str) -> str:
        value = (url or "").strip()
        if not value:
            return ""
        if not value.startswith(("http://", "https://")):
            value = "https://" + value
        return value.rstrip("/")

    @staticmethod
    def _friendly_http_error(error: urllib.error.HTTPError) -> str:
        try:
            body = error.read().decode("utf-8", errors="replace")
            payload = json.loads(body)
            if isinstance(payload, dict) and payload.get("message"):
                message = payload["message"]
                if isinstance(message, list):
                    message = "; ".join(str(item) for item in message)
                return f"HTTP {error.code}: {message}"
        except Exception:
            pass
        return f"HTTP {error.code}: {error.reason}"

    @staticmethod
    def _request_json(
        url: str,
        *,
        method: str = "GET",
        payload: dict[str, Any] | None = None,
        timeout: int = 12,
        opener: urllib.request.OpenerDirector | None = None,
    ) -> dict[str, Any]:
        data = None
        headers = {"Accept": "application/json", "User-Agent": "AkademikBerkarakter-APK-Builder/1.0"}
        if payload is not None:
            data = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(url, data=data, headers=headers, method=method)
        active_opener = opener or urllib.request.build_opener()
        try:
            with active_opener.open(request, timeout=timeout) as response:
                text = response.read().decode("utf-8", errors="replace")
                return json.loads(text) if text else {}
        except urllib.error.HTTPError as error:
            raise RuntimeError(ApkBuilderCore._friendly_http_error(error)) from error
        except urllib.error.URLError as error:
            reason = getattr(error, "reason", error)
            raise RuntimeError(f"Tidak bisa menghubungi server: {reason}") from error
        except TimeoutError as error:
            raise RuntimeError("Koneksi ke server timeout.") from error
        except json.JSONDecodeError as error:
            raise RuntimeError("Server merespons, tetapi bukan JSON yang valid.") from error

    def output_apk_name(self) -> str:
        return f"{self.slug(self.profile.app_display_name)}-v{self.profile.version_name}-code{self.profile.version_code}-{self.profile.build_type}.apk"

    def has_existing_keystore_config(self) -> bool:
        return (self.project / "keystore.properties").exists()

    def validate_profile(self) -> list[str]:
        errors: list[str] = []
        if not self.profile.app_display_name.strip():
            errors.append("Nama aplikasi wajib diisi.")
        if not re.match(r"^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$", self.profile.application_id):
            errors.append("Application ID tidak valid. Contoh: id.sch.man1rokanhulu.absensi")
        if self.profile.build_type not in {"debug", "release"}:
            errors.append("Build type harus debug/release.")
        if not self.profile.version_name.strip():
            errors.append("Version name wajib diisi.")
        if self.profile.version_code < 1:
            errors.append("Version code minimal 1.")
        if self.profile.min_supported_version_code < 1:
            errors.append("Minimum supported version code minimal 1.")
        if self.profile.min_supported_version_code > self.profile.version_code:
            errors.append("Minimum supported version tidak boleh lebih tinggi dari version code APK.")
        normalized = self.normalize_server_url(self.profile.server_base_url)
        if not normalized:
            errors.append("Server URL wajib diisi.")
        elif not normalized.startswith(("https://", "http://")):
            errors.append("Server URL harus http/https.")
        if self.profile.build_type == "release" and not normalized.startswith("https://"):
            errors.append("APK Resmi/Release wajib memakai HTTPS.")
        if self.profile.icon_file and not Path(self.profile.icon_file).expanduser().exists():
            errors.append("Icon file tidak ditemukan.")
        if not self.project.exists():
            errors.append("Folder project Android tidak ditemukan.")
        elif not (self.project / ("gradlew.bat" if os.name == "nt" else "gradlew")).exists():
            errors.append("Gradle launcher/gradlew tidak ditemukan di project Android.")
        if self.profile.build_type == "release":
            if self.profile.keystore_file:
                if not Path(self.profile.keystore_file).expanduser().exists():
                    errors.append("File keystore release tidak ditemukan.")
                if not self.profile.key_alias.strip():
                    errors.append("Alias keystore wajib diisi untuk APK resmi.")
                if not self.profile.store_password:
                    errors.append("Password keystore wajib diisi untuk APK resmi.")
            elif not self.has_existing_keystore_config():
                errors.append("APK Resmi membutuhkan keystore. Klik 'Buat Keystore Otomatis' dulu atau pakai APK Percobaan.")
        return errors

    @staticmethod
    def _parse_java_major(version_output: str) -> int | None:
        return _parse_java_major(version_output)

    def friendly_dependency_report(self) -> list[DependencyStatus]:
        checks: list[DependencyStatus] = []

        jdk_home = find_usable_jdk()
        if jdk_home:
            major, version_text = java_home_info(jdk_home)
            checks.append(DependencyStatus("java", True, "Java/JDK 17 atau 21", f"JDK ditemukan: Java {major} di {jdk_home} ({version_text})"))
        else:
            java_path = shutil.which("java")
            if not java_path:
                checks.append(DependencyStatus("java", False, "Java/JDK", "JDK 17/21 belum ditemukan.", "Install JDK 17 atau 21."))
            else:
                result = subprocess.run([java_path, "-version"], capture_output=True, text=True, timeout=8)
                version_text = (result.stderr or result.stdout).strip()
                major = self._parse_java_major(version_text)
                checks.append(DependencyStatus("java", False, "Java/JDK 17 atau 21", f"Java default versi {major or 'tidak diketahui'}, belum cocok untuk Android.", "Gunakan JDK 17 atau 21, bukan Java 26/terlalu baru."))

        keytool_path = (jdk_home / "bin" / ("keytool.exe" if os.name == "nt" else "keytool")) if jdk_home else None
        keytool_ok = bool((keytool_path and keytool_path.exists()) or shutil.which("keytool"))
        checks.append(DependencyStatus("keytool", keytool_ok, "Keytool", "Siap membuat keystore APK resmi." if keytool_ok else "Keytool belum ditemukan.", "Biasanya ikut JDK 17/21."))

        sdk_path = find_android_sdk()
        checks.append(DependencyStatus("android_sdk", bool(sdk_path), "Android SDK", f"SDK ditemukan: {sdk_path}" if sdk_path else "Android SDK belum ditemukan.", "Install Android Studio lalu set ANDROID_HOME ke folder SDK."))

        gradlew = self.project / ("gradlew.bat" if os.name == "nt" else "gradlew")
        checks.append(DependencyStatus("gradle_wrapper", gradlew.exists(), "Gradle Launcher", f"Ditemukan: {gradlew}" if gradlew.exists() else "gradlew tidak ditemukan.", "Pastikan project apps/android-reader ada."))

        checks.append(DependencyStatus("project_dir", self.project.exists(), "Project Android", f"Folder: {self.project}" if self.project.exists() else "Folder project Android tidak ditemukan.", "Pilih folder apps/android-reader di Mode Lanjutan."))

        adb_path = self.find_tool("adb")
        adb_ok = bool(adb_path)
        checks.append(DependencyStatus("adb", adb_ok, "ADB USB HP", f"ADB tersedia: {adb_path}" if adb_ok else "ADB belum tersedia. Build APK tetap bisa, install manual juga bisa.", "Opsional: install Android platform-tools dan aktifkan USB debugging."))

        icon_ok = (not self.profile.icon_file) or Path(self.profile.icon_file).expanduser().exists()
        checks.append(DependencyStatus("icon", icon_ok, "Icon APK", "Icon default/terpilih siap." if icon_ok else "File icon tidak ditemukan.", "Pilih icon PNG/SVG lain atau kosongkan."))
        return checks

    def dependency_summary_text(self) -> str:
        lines: list[str] = []
        for item in self.friendly_dependency_report():
            mark = "✅" if item.ok else "❌"
            lines.append(f"{mark} {item.title}: {item.message}")
            if not item.ok and item.fix:
                lines.append(f"   Solusi: {item.fix}")
        if not find_usable_jdk():
            lines.append("\nJika JDK 17/21 belum ada, download Temurin JDK 17/21 dari https://adoptium.net/ lalu buka lagi builder.")
        return "\n".join(lines)

    def build_environment(self) -> dict[str, str]:
        env = os.environ.copy()
        jdk_home = find_usable_jdk()
        if jdk_home:
            env["JAVA_HOME"] = str(jdk_home)
            env["PATH"] = str(jdk_home / "bin") + os.pathsep + env.get("PATH", "")
        sdk_path = find_android_sdk()
        if sdk_path:
            env["ANDROID_HOME"] = str(sdk_path)
            env["ANDROID_SDK_ROOT"] = str(sdk_path)
            env["PATH"] = str(sdk_path / "platform-tools") + os.pathsep + str(sdk_path / "cmdline-tools" / "latest" / "bin") + os.pathsep + env.get("PATH", "")
        return env

    def find_tool(self, name: str) -> str | None:
        env = self.build_environment()
        found = shutil.which(name, path=env.get("PATH"))
        return found

    def validate_dependencies(self) -> dict[str, bool | str]:
        gradlew = self.project / ("gradlew.bat" if os.name == "nt" else "gradlew")
        jdk_home = find_usable_jdk()
        java_major: int | None = None
        if jdk_home:
            java_major, _ = java_home_info(jdk_home)
        sdk_path = find_android_sdk()
        return {
            "java": bool(jdk_home),
            "java_home": str(jdk_home) if jdk_home else "",
            "java_major": java_major or "unknown",
            "java_supported": java_major in {17, 21},
            "keytool": bool(self.find_tool("keytool")),
            "android_sdk": bool(sdk_path),
            "android_home": str(sdk_path) if sdk_path else "",
            "gradle_wrapper": gradlew.exists(),
            "project_dir": self.project.exists(),
            "adb": bool(self.find_tool("adb")),
            "icon": (not self.profile.icon_file) or Path(self.profile.icon_file).expanduser().exists(),
        }

    def save_profile(self, path: str | Path) -> None:
        data = asdict(self.profile)
        if not self.profile.save_passwords:
            data["store_password"] = ""
            data["key_password"] = ""
        Path(path).write_text(json.dumps(data, indent=2), encoding="utf-8")

    @staticmethod
    def load_profile(path: str | Path) -> BuildProfile:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        allowed = {field.name for field in fields(BuildProfile)}
        clean = {key: value for key, value in data.items() if key in allowed}
        return BuildProfile(**clean)

    def increment_version_code(self) -> int:
        self.profile.version_code += 1
        return self.profile.version_code

    def check_server(self, timeout: int = 12) -> ServerConnectionResult:
        base = self.normalize_server_url(self.profile.server_base_url)
        if not base:
            return ServerConnectionResult(False, "", False, False, "Alamat web belum diisi.")
        health_ok = False
        version_ok = False
        metadata: dict[str, Any] | None = None
        messages: list[str] = []
        try:
            health = self._request_json(f"{base}/health/live", timeout=timeout)
            health_ok = health.get("status") == "ok" or bool(health)
        except Exception as exc:
            messages.append(f"Health check gagal: {exc}")
        try:
            metadata = self.fetch_web_version(base, timeout=timeout)
            version_ok = True
        except Exception as exc:
            messages.append(f"Endpoint versi APK gagal: {exc}")
        ok = health_ok and version_ok
        if ok:
            messages.append("Web Akademik Berkarakter siap dipakai untuk APK Android.")
        return ServerConnectionResult(ok, base, health_ok, version_ok, "\n".join(messages), metadata)

    def fetch_web_version(self, server_url: str | None = None, timeout: int = 12) -> dict[str, Any]:
        base = self.normalize_server_url(server_url or self.profile.server_base_url)
        if not base:
            raise RuntimeError("Server URL belum diisi.")
        payload = self._request_json(f"{base}/api/v1/mobile/android-reader/version", timeout=timeout)
        required = {"latestVersionName", "latestVersionCode", "minSupportedVersionCode"}
        missing = sorted(required - set(payload.keys()))
        if missing:
            raise RuntimeError(f"Metadata versi dari web tidak lengkap: {', '.join(missing)}")
        return payload

    def apply_web_version_to_profile(self, metadata: dict[str, Any]) -> None:
        latest_name = str(metadata.get("latestVersionName") or self.profile.version_name or "1.1.1")
        latest_code = int(metadata.get("latestVersionCode") or self.profile.version_code or 1)
        min_supported = int(metadata.get("minSupportedVersionCode") or 1)
        self.profile.version_name = latest_name
        self.profile.version_code = max(latest_code + 1, self.profile.version_code)
        self.profile.min_supported_version_code = min(min_supported, self.profile.version_code)
        self.profile.download_url = str(metadata.get("downloadUrl") or self.profile.download_url or "")
        self.profile.release_notes = str(metadata.get("releaseNotes") or self.profile.release_notes or "")
        self.profile.force_update = bool(metadata.get("forceUpdate") or self.profile.force_update)

    def publish_version_to_web(self, username: str, password: str, timeout: int = 15) -> dict[str, Any]:
        if not username.strip() or not password:
            raise RuntimeError("Username dan password admin/operator wajib diisi untuk publish metadata.")
        errors = self.validate_profile()
        if errors:
            raise RuntimeError("Perbaiki profil APK dulu: " + "; ".join(errors))
        base = self.normalize_server_url(self.profile.server_base_url)
        cookie_jar = http.cookiejar.CookieJar()
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookie_jar))
        self._request_json(
            f"{base}/api/v1/auth/login",
            method="POST",
            payload={"username": username.strip(), "password": password},
            timeout=timeout,
            opener=opener,
        )
        payload: dict[str, Any] = {
            "latestVersionName": self.profile.version_name,
            "latestVersionCode": int(self.profile.version_code),
            "minSupportedVersionCode": int(self.profile.min_supported_version_code),
            "forceUpdate": bool(self.profile.force_update),
        }
        if self.profile.download_url.strip():
            payload["downloadUrl"] = self.profile.download_url.strip()
        if self.profile.release_notes.strip():
            payload["releaseNotes"] = self.profile.release_notes.strip()
        return self._request_json(
            f"{base}/api/v1/mobile/android-reader/version",
            method="PUT",
            payload=payload,
            timeout=timeout,
            opener=opener,
        )

    def generate_branding(self) -> list[str]:
        errors = self.validate_profile()
        release_keystore_only = [item for item in errors if item.startswith("APK Resmi membutuhkan keystore") or item.startswith("Password keystore") or item.startswith("Alias keystore") or item.startswith("File keystore")]
        blocking = [item for item in errors if item not in release_keystore_only]
        if blocking:
            raise ValueError("; ".join(blocking))
        gradle_props = self.project / "gradle.properties"
        existing = gradle_props.read_text(encoding="utf-8") if gradle_props.exists() else ""
        values = {
            "SCHOOLHUB_APP_NAME": self.profile.app_display_name,
            "SCHOOLHUB_APPLICATION_ID": self.profile.application_id,
            "SCHOOLHUB_SERVER_BASE_URL": self.normalize_server_url(self.profile.server_base_url),
            "SCHOOLHUB_VERSION_NAME": self.profile.version_name,
            "SCHOOLHUB_VERSION_CODE": str(self.profile.version_code),
        }
        lines = [line for line in existing.splitlines() if not any(line.startswith(k + "=") for k in values)]
        lines.extend(f"{k}={v}" for k, v in values.items())
        gradle_props.write_text("\n".join(lines) + "\n", encoding="utf-8")

        strings = self.project / "app/src/main/res/values/strings.xml"
        strings.parent.mkdir(parents=True, exist_ok=True)
        strings.write_text(f'<resources>\n    <string name="app_name">{self.xml_escape(self.profile.app_display_name)}</string>\n</resources>\n', encoding="utf-8")

        generated: list[str] = [str(gradle_props), str(strings)]
        if self.profile.icon_file:
            generated.extend(self.generate_icons(Path(self.profile.icon_file).expanduser()))
        return generated

    def generate_icons(self, source: Path) -> list[str]:
        if source.suffix.lower() == ".svg":
            target_dir = self.project / "app/src/main/res/drawable"
            target_dir.mkdir(parents=True, exist_ok=True)
            target = target_dir / "ic_launcher_foreground.svg"
            shutil.copy2(source, target)
            return [str(target)]
        if Image is None:
            raise RuntimeError("Pillow belum terpasang untuk memproses icon PNG.")
        densities = {"mipmap-mdpi": 48, "mipmap-hdpi": 72, "mipmap-xhdpi": 96, "mipmap-xxhdpi": 144, "mipmap-xxxhdpi": 192}
        out: list[str] = []
        img = Image.open(source).convert("RGBA")
        for folder, size in densities.items():
            target_dir = self.project / "app/src/main/res" / folder
            target_dir.mkdir(parents=True, exist_ok=True)
            target = target_dir / "ic_launcher.png"
            img.resize((size, size)).save(target)
            out.append(str(target))
        return out

    def generate_keystore_command(self, keystore: str | Path, alias: str, password: str) -> list[str]:
        return ["keytool", "-genkeypair", "-v", "-keystore", str(keystore), "-alias", alias, "-keyalg", "RSA", "-keysize", "2048", "-validity", "10000", "-storepass", password, "-keypass", password, "-dname", "CN=Akademik Berkarakter APK Builder,O=MAN 1 Rokan Hulu,C=ID"]

    def create_keystore(self, keystore: str | Path, alias: str, password: str) -> str:
        if not password:
            raise RuntimeError("Password keystore wajib diisi.")
        keytool = self.find_tool("keytool")
        if not keytool:
            raise RuntimeError("Keytool tidak ditemukan. Install JDK 17/21 dulu.")
        target = Path(keystore).expanduser()
        target.parent.mkdir(parents=True, exist_ok=True)
        cmd = self.generate_keystore_command(target, alias or "schoolhub", password)
        cmd[0] = keytool
        result = subprocess.run(cmd, text=True, capture_output=True, env=self.build_environment())
        if result.returncode != 0:
            raise RuntimeError(result.stderr or result.stdout or "Keytool gagal membuat keystore.")
        return str(target.resolve())

    def write_keystore_properties(self) -> None:
        if not self.profile.keystore_file:
            return
        props = self.project / "keystore.properties"
        lines = [
            f"storeFile={Path(self.profile.keystore_file).expanduser().as_posix()}",
            f"keyAlias={self.profile.key_alias}",
            f"storePassword={self.profile.store_password}",
            f"keyPassword={self.profile.key_password or self.profile.store_password}",
        ]
        props.write_text("\n".join(lines) + "\n", encoding="utf-8")

    def gradle_command(self, clean: bool = False) -> list[str]:
        gradlew = self.project / ("gradlew.bat" if os.name == "nt" else "gradlew")
        task = f"assemble{self.profile.build_type.capitalize()}"
        return [str(gradlew), "clean", task] if clean else [str(gradlew), task]

    def build(self, clean: bool = False) -> Iterable[str]:
        errors = self.validate_profile()
        if errors:
            raise RuntimeError("Perbaiki dulu: " + "; ".join(errors))
        self.generate_branding()
        self.write_keystore_properties()
        cmd = self.gradle_command(clean=clean)
        env = self.build_environment()
        if env.get("JAVA_HOME"):
            yield f"JDK dipakai: {env['JAVA_HOME']}"
        if env.get("ANDROID_HOME"):
            yield f"Android SDK: {env['ANDROID_HOME']}"
        yield f"Menjalankan Gradle: {cmd[-1]}"
        proc = subprocess.Popen(cmd, cwd=self.project, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=env)
        assert proc.stdout
        for line in proc.stdout:
            yield line.rstrip()
        code = proc.wait()
        if code:
            raise RuntimeError(f"Gradle gagal dengan exit code {code}")
        yield from self.collect_output_apk()

    def collect_output_apk(self) -> Iterable[str]:
        apk_dir = self.project / "app/build/outputs/apk" / self.profile.build_type
        output_dir = Path(self.profile.output_dir).expanduser() if self.profile.output_dir else apk_dir
        output_dir.mkdir(parents=True, exist_ok=True)
        apks = sorted(apk_dir.glob("*.apk"), key=lambda p: p.stat().st_mtime, reverse=True)
        if not apks:
            yield "APK output belum ditemukan."
            return
        target = output_dir / self.output_apk_name()
        shutil.copy2(apks[0], target)
        yield f"APK: {target}"

    def latest_output_apk(self) -> Path | None:
        output_dir = Path(self.profile.output_dir).expanduser() if self.profile.output_dir else self.project / "app/build/outputs/apk" / self.profile.build_type
        named = output_dir / self.output_apk_name()
        if named.exists():
            return named.resolve()
        candidates = sorted(output_dir.glob("*.apk"), key=lambda p: p.stat().st_mtime, reverse=True) if output_dir.exists() else []
        if candidates:
            return candidates[0].resolve()
        build_dir = self.project / "app/build/outputs/apk" / self.profile.build_type
        candidates = sorted(build_dir.glob("*.apk"), key=lambda p: p.stat().st_mtime, reverse=True) if build_dir.exists() else []
        return candidates[0].resolve() if candidates else None

    def install_latest_apk_via_adb(self) -> str:
        adb = self.find_tool("adb")
        if not adb:
            raise RuntimeError("ADB tidak ditemukan. Install manual APK ke HP, atau install Android platform-tools.")
        apk = self.latest_output_apk()
        if not apk:
            raise RuntimeError("APK belum ditemukan. Klik 'Buat APK Sekarang' dulu.")
        result = subprocess.run([adb, "install", "-r", str(apk)], capture_output=True, text=True, timeout=120, env=self.build_environment())
        output = (result.stdout + "\n" + result.stderr).strip()
        if result.returncode != 0:
            raise RuntimeError(output or "ADB install gagal.")
        return output or "APK berhasil diinstall ke HP."

    @staticmethod
    def xml_escape(value: str) -> str:
        return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
