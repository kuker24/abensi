# ADR: Android reader trust model

Status: Accepted, partially verified

Android reader requests must remain authenticated with device signatures, nonce replay protection, timestamp checks, encrypted local secret storage, and no cleartext production traffic. CI now runs Gradle wrapper validation plus `test`, `lint`, and `assembleDebug`; release signing, SBOM, dependency scan, and checksum publication remain open gates.
