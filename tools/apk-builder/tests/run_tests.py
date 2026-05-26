from pathlib import Path
from tempfile import TemporaryDirectory

from schoolhub_apk_builder.core import ApkBuilderCore, BuildProfile, find_android_sdk, find_usable_jdk


def make_project(root: Path) -> Path:
    project = root / 'android-reader'
    (project / 'app/src/main/res/values').mkdir(parents=True)
    (project / 'app/src/main/res/values/strings.xml').write_text('<resources/>')
    (project / 'gradlew').write_text('#!/bin/sh\n')
    (project / 'gradle.properties').write_text('')
    return project


def main():
    with TemporaryDirectory() as raw:
        tmp = Path(raw)
        project = make_project(tmp)
        profile = BuildProfile(project_dir=str(project), app_display_name='Custom Absensi', application_id='id.sch.test.absensi', server_base_url='https://example.test', version_name='1.2.3', version_code=4)
        core = ApkBuilderCore(profile)
        profile_path = tmp / 'profile.json'
        core.save_profile(profile_path)
        assert ApkBuilderCore.load_profile(profile_path).app_display_name == 'Custom Absensi'
        assert core.increment_version_code() == 5
        profile.version_code = 4
        assert core.output_apk_name() == 'Custom-Absensi-v1.2.3-code4-debug.apk'
        assert core.gradle_command()[-1] == 'assembleDebug'
        generated = core.generate_branding()
        props = (project / 'gradle.properties').read_text()
        assert 'SCHOOLHUB_APPLICATION_ID=id.sch.test.absensi' in props
        assert generated
        bad = ApkBuilderCore(BuildProfile(project_dir=str(project), build_type='release', server_base_url='http://localhost'))
        assert any('HTTPS' in item for item in bad.validate_profile())
        official = ApkBuilderCore(BuildProfile(project_dir=str(project), build_type='release', server_base_url='https://example.test'))
        assert any('keystore' in item.lower() for item in official.validate_profile())
        assert ApkBuilderCore.normalize_server_url('school.example/') == 'https://school.example'
        profile.store_password = 'secret-a'
        profile.key_password = 'secret-b'
        core.save_profile(profile_path)
        raw_profile = profile_path.read_text()
        assert 'secret-a' not in raw_profile
        assert 'secret-b' not in raw_profile
        core.apply_web_version_to_profile({'latestVersionName': '1.9.0', 'latestVersionCode': 9, 'minSupportedVersionCode': 2})
        assert profile.version_code == 10
        env = core.build_environment()
        if find_usable_jdk():
            assert env.get('JAVA_HOME')
        if find_android_sdk():
            assert env.get('ANDROID_HOME')
    print('python builder tests PASS')


if __name__ == '__main__':
    main()
