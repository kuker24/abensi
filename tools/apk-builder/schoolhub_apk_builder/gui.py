from __future__ import annotations

import sys
import webbrowser
from pathlib import Path

from PySide6.QtCore import QThread, Signal, Qt
from PySide6.QtWidgets import (
    QApplication,
    QCheckBox,
    QFileDialog,
    QFormLayout,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMainWindow,
    QMessageBox,
    QPlainTextEdit,
    QPushButton,
    QSpinBox,
    QComboBox,
    QTabWidget,
    QVBoxLayout,
    QWidget,
)

from .core import ApkBuilderCore, BuildProfile, DEFAULT_APP_ID, DEFAULT_APP_NAME, DEFAULT_PROJECT_DIR, DEFAULT_SERVER


class BuildThread(QThread):
    line = Signal(str)
    failed = Signal(str)
    done = Signal()

    def __init__(self, core: ApkBuilderCore, clean: bool = False):
        super().__init__()
        self.core = core
        self.clean = clean

    def run(self):
        try:
            for msg in self.core.build(clean=self.clean):
                self.line.emit(msg)
            self.done.emit()
        except Exception as exc:  # pragma: no cover
            self.failed.emit(str(exc))


def primary_button(text: str) -> QPushButton:
    button = QPushButton(text)
    button.setMinimumHeight(48)
    button.setCursor(Qt.PointingHandCursor)
    button.setStyleSheet(
        "QPushButton { background: #2563eb; color: white; border: 0; border-radius: 12px; "
        "font-size: 16px; font-weight: 700; padding: 10px 18px; }"
        "QPushButton:hover { background: #1d4ed8; }"
        "QPushButton:disabled { background: #94a3b8; }"
    )
    return button


def secondary_button(text: str) -> QPushButton:
    button = QPushButton(text)
    button.setMinimumHeight(38)
    button.setCursor(Qt.PointingHandCursor)
    return button


def help_box(text: str) -> QLabel:
    label = QLabel(text)
    label.setWordWrap(True)
    label.setStyleSheet("background:#eff6ff;color:#1e3a8a;border-radius:12px;padding:12px;font-size:13px;")
    return label


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Akademik Berkarakter APK Builder — Mode Mudah")
        self.profile = BuildProfile()
        self.thread: BuildThread | None = None

        root = QWidget()
        layout = QVBoxLayout(root)
        self.status = QLabel("Ikuti langkah 1 sampai 4. Untuk operator awam cukup isi URL web lalu klik BUAT APK SEKARANG.")
        self.status.setWordWrap(True)
        self.status.setStyleSheet("background:#f8fafc;color:#334155;border:1px solid #e2e8f0;border-radius:12px;padding:12px;")
        layout.addWidget(self.status)

        self.tabs = QTabWidget()
        layout.addWidget(self.tabs)
        self._build_step_check_laptop()
        self._build_step_connect_web()
        self._build_step_branding()
        self._build_step_build_apk()
        self._build_step_publish_web()
        self._build_advanced_tab()

        self.setCentralWidget(root)
        self.resize(1180, 820)

    # ---------- UI pages ----------
    def _build_step_check_laptop(self):
        page = QWidget(); layout = QVBoxLayout(page)
        layout.addWidget(help_box(
            "Langkah 1 — Builder akan mengecek apakah laptop siap membuat APK: Java/JDK 17/21, Android SDK, "
            "Gradle, dan tools install ke HP. Jika ada yang merah, ikuti solusi yang muncul."
        ))
        btn = primary_button("1. CEK KESIAPAN LAPTOP")
        btn.clicked.connect(self.validate)
        layout.addWidget(btn)
        self.dep_log = QPlainTextEdit(); self.dep_log.setReadOnly(True); self.dep_log.setMinimumHeight(420)
        layout.addWidget(self.dep_log)
        self.tabs.addTab(page, "1 Cek Laptop")

    def _build_step_connect_web(self):
        page = QWidget(); layout = QVBoxLayout(page)
        layout.addWidget(help_box(
            "Langkah 2 — Hubungkan APK ke web Akademik Berkarakter. Isi alamat web yang biasa dibuka admin/operator, "
            "lalu klik cek. Builder akan menguji health check dan endpoint versi APK."
        ))
        form = QFormLayout()
        self.server = QLineEdit(DEFAULT_SERVER)
        self.server.setPlaceholderText("Contoh: https://absensi.man1rokanhulu.cloud")
        form.addRow("Alamat Web Akademik Berkarakter", self.server)
        layout.addLayout(form)
        row = QHBoxLayout()
        check_btn = primary_button("2. CEK KONEKSI KE WEB")
        check_btn.clicked.connect(self.check_server)
        fetch_btn = secondary_button("Ambil Pengaturan dari Web")
        fetch_btn.clicked.connect(self.fetch_from_web)
        row.addWidget(check_btn); row.addWidget(fetch_btn)
        layout.addLayout(row)
        self.web_log = QPlainTextEdit(); self.web_log.setReadOnly(True); self.web_log.setMinimumHeight(360)
        layout.addWidget(self.web_log)
        self.tabs.addTab(page, "2 Hubungkan Web")

    def _build_step_branding(self):
        page = QWidget(); layout = QVBoxLayout(page)
        layout.addWidget(help_box(
            "Langkah 3 — Isi nama aplikasi dan pilih jenis APK. Untuk uji coba gunakan 'APK Percobaan'. "
            "Untuk pemakaian resmi petugas gunakan 'APK Resmi Sekolah' dan buat keystore di Mode Lanjutan."
        ))
        form = QFormLayout()
        self.app_name = QLineEdit(DEFAULT_APP_NAME)
        self.version_name = QLineEdit("1.1.1")
        self.version_code = QSpinBox(); self.version_code.setMinimum(1); self.version_code.setMaximum(999999); self.version_code.setValue(1)
        self.simple_build_type = QComboBox()
        self.simple_build_type.addItem("APK Percobaan — untuk uji coba HP internal", "debug")
        self.simple_build_type.addItem("APK Resmi Sekolah — release/signed", "release")
        self.icon = QLineEdit(); self.icon.setPlaceholderText("Opsional. Kosongkan untuk icon default.")
        form.addRow("Nama Aplikasi", self.app_name)
        form.addRow("Version Name", self.version_name)
        form.addRow("Version Code", self.version_code)
        form.addRow("Jenis APK", self.simple_build_type)
        form.addRow("Icon APK", self.icon)
        layout.addLayout(form)
        row = QHBoxLayout()
        pick_icon = secondary_button("Pilih Icon PNG/SVG")
        pick_icon.clicked.connect(self.pick_icon)
        brand_btn = primary_button("3. SIMPAN BRANDING")
        brand_btn.clicked.connect(self.brand)
        row.addWidget(pick_icon); row.addWidget(brand_btn)
        layout.addLayout(row)
        self.brand_log = QPlainTextEdit(); self.brand_log.setReadOnly(True); self.brand_log.setMinimumHeight(240)
        layout.addWidget(self.brand_log)
        self.tabs.addTab(page, "3 Atur APK")

    def _build_step_build_apk(self):
        page = QWidget(); layout = QVBoxLayout(page)
        layout.addWidget(help_box(
            "Langkah 4 — Klik tombol biru besar. Jika berhasil, folder APK bisa dibuka. Secret reader TIDAK masuk APK; "
            "setelah APK terinstall, lakukan provisioning dari web admin /admin/devices."
        ))
        self.build_btn = primary_button("4. BUAT APK SEKARANG")
        self.build_btn.clicked.connect(lambda: self.build(clean=False))
        layout.addWidget(self.build_btn)
        row = QHBoxLayout()
        clean = secondary_button("Clean Build")
        clean.clicked.connect(lambda: self.build(clean=True))
        open_output = secondary_button("Buka Folder APK")
        open_output.clicked.connect(self.open_output)
        install = secondary_button("Install ke HP via Kabel USB")
        install.clicked.connect(self.install_usb)
        guide = secondary_button("Lihat Panduan Provisioning")
        guide.clicked.connect(self.open_provisioning_guide)
        row.addWidget(clean); row.addWidget(open_output); row.addWidget(install); row.addWidget(guide)
        layout.addLayout(row)
        self.build_log = QPlainTextEdit(); self.build_log.setReadOnly(True); self.build_log.setMinimumHeight(430)
        layout.addWidget(QLabel("Log Build")); layout.addWidget(self.build_log)
        self.tabs.addTab(page, "4 Buat APK")

    def _build_step_publish_web(self):
        page = QWidget(); layout = QVBoxLayout(page)
        layout.addWidget(help_box(
            "Opsional — Setelah APK berhasil dibuat dan ditaruh di tempat download sekolah, Anda bisa publish metadata versi ke web. "
            "Builder hanya mengirim version name/code, link download, release notes, dan force update. File APK tidak diupload otomatis."
        ))
        form = QFormLayout()
        self.download_url = QLineEdit(); self.download_url.setPlaceholderText("Opsional: link download APK, harus HTTPS untuk produksi")
        self.release_notes = QPlainTextEdit("APK Android QR Reader Akademik Berkarakter."); self.release_notes.setMaximumHeight(100)
        self.min_supported = QSpinBox(); self.min_supported.setMinimum(1); self.min_supported.setMaximum(999999); self.min_supported.setValue(1)
        self.force_update = QCheckBox("Paksa update untuk APK lama")
        self.admin_user = QLineEdit(); self.admin_user.setPlaceholderText("username admin/operator")
        self.admin_pass = QLineEdit(); self.admin_pass.setEchoMode(QLineEdit.Password); self.admin_pass.setPlaceholderText("password tidak disimpan")
        form.addRow("Download URL APK", self.download_url)
        form.addRow("Release Notes", self.release_notes)
        form.addRow("Minimum Supported Code", self.min_supported)
        form.addRow("Force Update", self.force_update)
        form.addRow("Username Web", self.admin_user)
        form.addRow("Password Web", self.admin_pass)
        layout.addLayout(form)
        publish = primary_button("PUBLISH METADATA KE WEB")
        publish.clicked.connect(self.publish_web)
        layout.addWidget(publish)
        self.publish_log = QPlainTextEdit(); self.publish_log.setReadOnly(True); self.publish_log.setMinimumHeight(250)
        layout.addWidget(self.publish_log)
        self.tabs.addTab(page, "5 Publish Web")

    def _build_advanced_tab(self):
        page = QWidget(); layout = QVBoxLayout(page)
        layout.addWidget(help_box(
            "Mode Lanjutan — hanya untuk operator IT. Operator awam tidak perlu mengubah bagian ini, kecuali saat membuat APK Resmi/Release."
        ))
        form_box = QGroupBox("Pengaturan Teknis")
        form = QFormLayout(form_box)
        self.app_id = QLineEdit(DEFAULT_APP_ID)
        self.project = QLineEdit(DEFAULT_PROJECT_DIR)
        self.output = QLineEdit(); self.output.setPlaceholderText("Kosongkan = folder default build Android")
        self.keystore = QLineEdit(); self.keystore.setPlaceholderText("Wajib untuk APK Resmi Sekolah")
        self.alias = QLineEdit("schoolhub")
        self.store_pass = QLineEdit(); self.store_pass.setEchoMode(QLineEdit.Password)
        self.key_pass = QLineEdit(); self.key_pass.setEchoMode(QLineEdit.Password); self.key_pass.setPlaceholderText("Kosongkan = sama dengan store password")
        self.save_passwords = QCheckBox("Simpan password di profile JSON lokal (tidak disarankan)")
        form.addRow("Package/Application ID", self.app_id)
        form.addRow("Project Android", self.project)
        form.addRow("Output Folder", self.output)
        form.addRow("Keystore Release", self.keystore)
        form.addRow("Alias", self.alias)
        form.addRow("Store Password", self.store_pass)
        form.addRow("Key Password", self.key_pass)
        form.addRow("Simpan Password", self.save_passwords)
        layout.addWidget(form_box)
        pick_row = QHBoxLayout()
        for text, slot in [
            ("Pilih Project", self.pick_project),
            ("Pilih Output", self.pick_output),
            ("Import Keystore", self.pick_keystore),
            ("Buat Keystore Otomatis", self.generate_keystore),
        ]:
            btn = secondary_button(text); btn.clicked.connect(slot); pick_row.addWidget(btn)
        layout.addLayout(pick_row)
        profile_row = QHBoxLayout()
        for text, slot in [
            ("Save Profile", self.save),
            ("Load Profile", self.load),
            ("Naikkan VersionCode", self.increment),
            ("Cek Profil Teknis", self.validate_profile_only),
        ]:
            btn = secondary_button(text); btn.clicked.connect(slot); profile_row.addWidget(btn)
        layout.addLayout(profile_row)
        self.advanced_log = QPlainTextEdit(); self.advanced_log.setReadOnly(True); self.advanced_log.setMinimumHeight(180)
        layout.addWidget(self.advanced_log)
        self.tabs.addTab(page, "Mode Lanjutan")

    # ---------- profile helpers ----------
    def read_profile(self) -> BuildProfile:
        return BuildProfile(
            app_display_name=self.app_name.text().strip() or DEFAULT_APP_NAME,
            application_id=self.app_id.text().strip() or DEFAULT_APP_ID,
            server_base_url=self.server.text().strip(),
            version_name=self.version_name.text().strip() or "1.1.1",
            version_code=self.version_code.value(),
            build_type=self.simple_build_type.currentData() or "debug",
            icon_file=self.icon.text().strip(),
            output_dir=self.output.text().strip(),
            project_dir=self.project.text().strip() or DEFAULT_PROJECT_DIR,
            keystore_file=self.keystore.text().strip(),
            key_alias=self.alias.text().strip() or "schoolhub",
            store_password=self.store_pass.text(),
            key_password=self.key_pass.text(),
            save_passwords=self.save_passwords.isChecked(),
            download_url=self.download_url.text().strip(),
            release_notes=self.release_notes.toPlainText().strip(),
            min_supported_version_code=self.min_supported.value(),
            force_update=self.force_update.isChecked(),
        )

    def apply_profile(self, p: BuildProfile):
        self.profile = p
        self.app_name.setText(p.app_display_name)
        self.app_id.setText(p.application_id)
        self.server.setText(p.server_base_url)
        self.version_name.setText(p.version_name)
        self.version_code.setValue(int(p.version_code))
        idx = self.simple_build_type.findData(p.build_type)
        if idx >= 0:
            self.simple_build_type.setCurrentIndex(idx)
        self.icon.setText(p.icon_file)
        self.output.setText(p.output_dir)
        self.project.setText(p.project_dir)
        self.keystore.setText(p.keystore_file)
        self.alias.setText(p.key_alias)
        self.download_url.setText(p.download_url)
        self.release_notes.setPlainText(p.release_notes)
        self.min_supported.setValue(int(p.min_supported_version_code))
        self.force_update.setChecked(bool(p.force_update))

    def core(self) -> ApkBuilderCore:
        self.profile = self.read_profile()
        return ApkBuilderCore(self.profile)

    def set_status(self, text: str, kind: str = "info"):
        colors = {
            "info": ("#f8fafc", "#334155", "#e2e8f0"),
            "ok": ("#ecfdf5", "#065f46", "#a7f3d0"),
            "bad": ("#fef2f2", "#991b1b", "#fecaca"),
            "warn": ("#fffbeb", "#92400e", "#fde68a"),
        }
        bg, fg, border = colors.get(kind, colors["info"])
        self.status.setText(text)
        self.status.setStyleSheet(f"background:{bg};color:{fg};border:1px solid {border};border-radius:12px;padding:12px;")

    def append(self, box: QPlainTextEdit, text: str):
        box.appendPlainText(text)

    # ---------- actions ----------
    def validate(self):
        core = self.core()
        self.dep_log.setPlainText(core.dependency_summary_text())
        failed = [item for item in core.friendly_dependency_report() if not item.ok and item.key not in {"adb"}]
        if failed:
            self.set_status("Laptop belum sepenuhnya siap. Ikuti solusi yang berwarna merah di Langkah 1.", "warn")
        else:
            self.set_status("Laptop siap untuk build APK.", "ok")

    def validate_profile_only(self):
        errors = self.core().validate_profile()
        self.advanced_log.setPlainText("Profil OK." if not errors else "\n".join(f"- {item}" for item in errors))
        self.set_status("Profil teknis OK." if not errors else "Ada pengaturan yang perlu diperbaiki.", "ok" if not errors else "warn")

    def check_server(self):
        core = self.core()
        result = core.check_server()
        lines = [
            f"URL: {result.base_url}",
            f"Health: {'OK' if result.health_ok else 'GAGAL'}",
            f"Endpoint Versi APK: {'OK' if result.version_ok else 'GAGAL'}",
            result.message,
        ]
        if result.version_metadata:
            lines.append("Metadata versi: " + str(result.version_metadata))
        self.web_log.setPlainText("\n".join(lines))
        self.set_status("Web Akademik Berkarakter siap dipakai APK." if result.ok else "Web belum siap/URL salah. Cek pesan di Langkah 2.", "ok" if result.ok else "bad")

    def fetch_from_web(self):
        try:
            core = self.core()
            metadata = core.fetch_web_version()
            core.apply_web_version_to_profile(metadata)
            self.apply_profile(core.profile)
            self.web_log.setPlainText(
                "Berhasil ambil pengaturan dari web.\n"
                f"Latest di web: v{metadata.get('latestVersionName')} code {metadata.get('latestVersionCode')}\n"
                f"Version code APK baru disarankan: {core.profile.version_code}"
            )
            self.set_status("Pengaturan versi dari web berhasil diambil.", "ok")
        except Exception as exc:
            QMessageBox.critical(self, "Gagal ambil pengaturan", str(exc))
            self.set_status("Gagal ambil pengaturan dari web.", "bad")

    def brand(self):
        try:
            generated = self.core().generate_branding()
            self.brand_log.setPlainText("Branding berhasil disimpan:\n" + "\n".join(generated))
            self.set_status("Branding APK berhasil disimpan.", "ok")
        except Exception as exc:
            QMessageBox.critical(self, "Branding gagal", str(exc))
            self.set_status("Branding gagal. Cek data APK.", "bad")

    def build(self, clean: bool = False):
        if self.thread and self.thread.isRunning():
            QMessageBox.information(self, "Build sedang berjalan", "Tunggu build sebelumnya selesai dulu.")
            return
        core = self.core()
        errors = core.validate_profile()
        if errors:
            QMessageBox.warning(self, "Belum bisa build", "Perbaiki dulu:\n\n" + "\n".join(f"- {item}" for item in errors))
            self.set_status("Belum bisa build. Ada pengaturan yang perlu diperbaiki.", "warn")
            return
        self.build_log.clear()
        self.build_btn.setDisabled(True)
        self.set_status("Build APK sedang berjalan. Jangan tutup aplikasi.", "info")
        self.thread = BuildThread(core, clean=clean)
        self.thread.line.connect(lambda line: self.append(self.build_log, line))
        self.thread.failed.connect(self.build_failed)
        self.thread.done.connect(self.build_done)
        self.thread.start()

    def build_done(self):
        self.build_btn.setDisabled(False)
        self.append(self.build_log, "\nSELESAI: APK berhasil dibuat.")
        self.set_status("APK berhasil dibuat. Klik 'Buka Folder APK' atau lanjut provisioning perangkat.", "ok")

    def build_failed(self, error: str):
        self.build_btn.setDisabled(False)
        self.append(self.build_log, "\nGAGAL: " + error)
        QMessageBox.critical(self, "Build gagal", error)
        self.set_status("Build APK gagal. Cek log build untuk detail.", "bad")

    def publish_web(self):
        try:
            result = self.core().publish_version_to_web(self.admin_user.text(), self.admin_pass.text())
            self.admin_pass.clear()
            self.publish_log.setPlainText("Metadata berhasil dipublish ke web:\n" + str(result))
            self.set_status("Metadata versi APK berhasil dipublish ke web.", "ok")
        except Exception as exc:
            self.admin_pass.clear()
            QMessageBox.critical(self, "Publish gagal", str(exc))
            self.set_status("Publish metadata gagal.", "bad")

    def install_usb(self):
        try:
            output = self.core().install_latest_apk_via_adb()
            QMessageBox.information(self, "Install selesai", output)
            self.set_status("APK berhasil diinstall ke HP via USB.", "ok")
        except Exception as exc:
            QMessageBox.warning(self, "Install via USB gagal", str(exc))
            self.set_status("Install via USB gagal. APK tetap bisa dicopy manual ke HP.", "warn")

    def open_output(self):
        core = self.core()
        apk = core.latest_output_apk()
        out = apk.parent if apk else (Path(core.profile.output_dir).expanduser() if core.profile.output_dir else core.project / "app/build/outputs/apk" / core.profile.build_type)
        out.mkdir(parents=True, exist_ok=True)
        webbrowser.open(out.resolve().as_uri())

    def open_provisioning_guide(self):
        root = Path(__file__).resolve()
        doc = None
        for parent in root.parents:
            candidate = parent / "docs/ANDROID_QR_READER.md"
            if candidate.exists():
                doc = candidate
                break
        if doc:
            webbrowser.open(doc.resolve().as_uri())
        else:
            QMessageBox.information(self, "Panduan", "Buka web admin /admin/devices → tab Android QR Reader → buat QR provisioning → scan dari APK.")

    def save(self):
        path, _ = QFileDialog.getSaveFileName(self, "Save Profile", "schoolhub-apk-profile.json", "JSON (*.json)")
        if path:
            self.core().save_profile(path)
            self.advanced_log.appendPlainText(f"Profile disimpan: {path}")

    def load(self):
        path, _ = QFileDialog.getOpenFileName(self, "Load Profile", "", "JSON (*.json)")
        if path:
            self.apply_profile(ApkBuilderCore.load_profile(path))
            self.advanced_log.appendPlainText(f"Profile dibuka: {path}")

    def increment(self):
        self.version_code.setValue(self.version_code.value() + 1)
        self.advanced_log.appendPlainText(f"VersionCode sekarang: {self.version_code.value()}")

    def pick_icon(self):
        path, _ = QFileDialog.getOpenFileName(self, "Pilih Icon", "", "Images (*.png *.svg)")
        if path:
            self.icon.setText(path)

    def pick_project(self):
        path = QFileDialog.getExistingDirectory(self, "Pilih Folder apps/android-reader", self.project.text() or DEFAULT_PROJECT_DIR)
        if path:
            self.project.setText(path)

    def pick_output(self):
        path = QFileDialog.getExistingDirectory(self, "Pilih Folder Output APK", self.output.text() or str(Path.home()))
        if path:
            self.output.setText(path)

    def generate_keystore(self):
        password = self.store_pass.text() or self.key_pass.text()
        if not password:
            QMessageBox.warning(self, "Password wajib", "Isi Store Password dulu. Minimal 8 karakter disarankan.")
            return
        if len(password) < 8:
            QMessageBox.warning(self, "Password terlalu pendek", "Gunakan password minimal 8 karakter untuk keystore resmi.")
            return
        default_path = str(Path(self.project.text() or DEFAULT_PROJECT_DIR) / "keystore" / "schoolhub-release.jks")
        path, _ = QFileDialog.getSaveFileName(self, "Buat Keystore Release", default_path, "Keystore (*.jks)")
        if not path:
            return
        try:
            created = self.core().create_keystore(path, self.alias.text() or "schoolhub", password)
            self.keystore.setText(created)
            self.advanced_log.appendPlainText("Keystore berhasil dibuat. Simpan file dan password ini dengan aman. Password tidak ditampilkan di log.")
            self.set_status("Keystore release berhasil dibuat. Sekarang APK Resmi bisa dibuild.", "ok")
        except Exception as exc:
            QMessageBox.critical(self, "Keystore gagal", str(exc))
            self.set_status("Keystore gagal dibuat.", "bad")

    def pick_keystore(self):
        path, _ = QFileDialog.getOpenFileName(self, "Import Keystore", "", "Keystore (*.jks *.keystore);;All (*)")
        if path:
            self.keystore.setText(path)


def main():
    app = QApplication(sys.argv)
    win = MainWindow(); win.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
