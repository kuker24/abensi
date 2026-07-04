from pathlib import Path

from schoolhub_apk_builder.core import ApkBuilderCore, BuildProfile, find_android_sdk, find_usable_jdk


def make_project(tmp_path: Path) -> Path:
    project = tmp_path / 'android-reader'
    (project / 'app/src/main/res/values').mkdir(parents=True)
    (project / 'app/src/main/res/values/strings.xml').write_text('<resources/>')
    (project / 'gradlew').write_text('#!/bin/sh\n')
    (project / 'gradle.properties').write_text('')
    return project


def test_save_load_profile(tmp_path):
    profile = BuildProfile(app_display_name='Test App', version_code=2)
    path = tmp_path / 'p.json'
    ApkBuilderCore(profile).save_profile(path)
    loaded = ApkBuilderCore.load_profile(path)
    assert loaded.app_display_name == 'Test App'
    assert loaded.version_code == 2


def test_save_profile_does_not_store_password_by_default(tmp_path):
    profile = BuildProfile(store_password='super-secret', key_password='key-secret')
    path = tmp_path / 'p.json'
    ApkBuilderCore(profile).save_profile(path)
    raw = path.read_text()
    assert 'super-secret' not in raw
    assert 'key-secret' not in raw


def test_load_profile_ignores_unknown_fields(tmp_path):
    path = tmp_path / 'p.json'
    path.write_text('{"app_display_name":"A","unknown":"B"}')
    loaded = ApkBuilderCore.load_profile(path)
    assert loaded.app_display_name == 'A'


def test_increment_version_code():
    core = ApkBuilderCore(BuildProfile(version_code=7))
    assert core.increment_version_code() == 8


def test_default_profile_matches_current_android_reader_version():
    profile = BuildProfile()
    assert profile.version_name == '1.2.0'
    assert profile.version_code == 4


def test_output_apk_naming():
    core = ApkBuilderCore(BuildProfile(app_display_name='SIAB2 Reader', version_name='1.0.0', version_code=1, build_type='release'))
    assert core.output_apk_name() == 'SIAB2-Reader-v1.0.0-code1-release.apk'


def test_gradle_command(tmp_path):
    project = make_project(tmp_path)
    core = ApkBuilderCore(BuildProfile(project_dir=str(project), build_type='debug'))
    cmd = core.gradle_command()
    assert cmd[-1] == 'assembleDebug'


def test_generate_branding_config(tmp_path):
    project = make_project(tmp_path)
    core = ApkBuilderCore(BuildProfile(project_dir=str(project), app_display_name='Custom Absensi', application_id='id.sch.test.absensi', server_base_url='https://example.test', version_name='1.2.3', version_code=4))
    generated = core.generate_branding()
    props = (project / 'gradle.properties').read_text()
    assert 'SCHOOLHUB_APP_NAME=Custom Absensi' in props
    assert 'SCHOOLHUB_APPLICATION_ID=id.sch.test.absensi' in props
    assert generated


def test_profile_validation_rejects_bad_release_http():
    core = ApkBuilderCore(BuildProfile(build_type='release', server_base_url='http://localhost'))
    assert any('HTTPS' in item for item in core.validate_profile())


def test_release_requires_keystore_for_official_apk(tmp_path):
    project = make_project(tmp_path)
    core = ApkBuilderCore(BuildProfile(project_dir=str(project), build_type='release', server_base_url='https://example.test'))
    assert any('keystore' in item.lower() for item in core.validate_profile())


def test_normalize_server_url():
    assert ApkBuilderCore.normalize_server_url('school.example/') == 'https://school.example'
    assert ApkBuilderCore.normalize_server_url('https://school.example///') == 'https://school.example'


def test_empty_server_check_is_friendly():
    result = ApkBuilderCore(BuildProfile(server_base_url='')).check_server()
    assert not result.ok
    assert 'belum diisi' in result.message


def test_apply_web_version_increments_code():
    profile = BuildProfile(version_code=1)
    core = ApkBuilderCore(profile)
    core.apply_web_version_to_profile({
        'latestVersionName': '1.4.0',
        'latestVersionCode': 7,
        'minSupportedVersionCode': 3,
        'downloadUrl': 'https://example.test/app.apk',
        'releaseNotes': 'Rilis uji',
        'forceUpdate': True,
    })
    assert profile.version_name == '1.4.0'
    assert profile.version_code == 8
    assert profile.min_supported_version_code == 3
    assert profile.force_update is True


def test_keystore_properties_write(tmp_path):
    project = make_project(tmp_path)
    keystore = tmp_path / 'release.jks'
    keystore.write_text('dummy')
    core = ApkBuilderCore(BuildProfile(project_dir=str(project), keystore_file=str(keystore), key_alias='schoolhub', store_password='pass12345', key_password='pass67890'))
    core.write_keystore_properties()
    props = (project / 'keystore.properties').read_text()
    assert f'storeFile={keystore.as_posix()}' in props
    assert 'keyAlias=schoolhub' in props


def test_dependency_report_is_friendly():
    text = ApkBuilderCore(BuildProfile()).dependency_summary_text()
    assert 'Java/JDK' in text
    assert 'Android SDK' in text


def test_build_environment_uses_detected_tools_when_available():
    env = ApkBuilderCore(BuildProfile()).build_environment()
    if find_usable_jdk():
        assert env.get('JAVA_HOME')
    if find_android_sdk():
        assert env.get('ANDROID_HOME')
