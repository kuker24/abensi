@echo off
setlocal
cd /d %~dp0

echo Membuka SchoolHub APK Builder...

if exist "%USERPROFILE%\.local\jdks\jdk-17\bin\java.exe" set "JAVA_HOME=%USERPROFILE%\.local\jdks\jdk-17"
if not defined JAVA_HOME if exist "%USERPROFILE%\.local\jdks\jdk-21\bin\java.exe" set "JAVA_HOME=%USERPROFILE%\.local\jdks\jdk-21"
if defined JAVA_HOME (
  set "PATH=%JAVA_HOME%\bin;%PATH%"
  echo JDK otomatis dipakai: %JAVA_HOME%
) else (
  echo Peringatan: JDK 17/21 belum ditemukan. Build APK butuh JDK 17/21.
  echo Download JDK: https://adoptium.net/temurin/releases/?version=17
)

if not defined ANDROID_HOME if exist "%LOCALAPPDATA%\Android\Sdk\platforms" set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
if not defined ANDROID_HOME if exist "%USERPROFILE%\AppData\Local\Android\Sdk\platforms" set "ANDROID_HOME=%USERPROFILE%\AppData\Local\Android\Sdk"
if defined ANDROID_HOME (
  set "ANDROID_SDK_ROOT=%ANDROID_HOME%"
  set "PATH=%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\cmdline-tools\latest\bin;%PATH%"
  echo Android SDK otomatis dipakai: %ANDROID_HOME%
) else (
  echo Peringatan: Android SDK belum ditemukan. Install Android Studio jika build APK gagal.
)

where py >nul 2>nul
if %ERRORLEVEL%==0 (
  set PYTHON_CMD=py -3
) else (
  set PYTHON_CMD=python
)

if not exist .venv (
  echo Membuat virtual environment Python...
  %PYTHON_CMD% -m venv .venv
  if errorlevel 1 goto error
)

call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r requirements.txt
python main.py
if errorlevel 1 goto error
exit /b 0

:error
echo.
echo Gagal membuka APK Builder. Pastikan Python 3.11+, JDK 17/21, dan Android SDK sudah terpasang.
pause
exit /b 1
