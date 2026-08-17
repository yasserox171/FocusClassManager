#!/usr/bin/env python3
"""
Configure la signature de release dans le projet Android généré par `expo prebuild`.

Le gabarit Expo signe la release avec la clé de debug. Un tel APK s'installe
sans problème, mais Android refuse ensuite toute mise à jour signée avec une
autre clé : il faut donc utiliser la clé définitive dès la première publication.

Le dossier `android/` étant régénéré à chaque prebuild, ce correctif doit être
rejoué après chaque génération. Le script est idempotent.

Usage : python3 scripts/apply-release-signing.py [chemin/vers/android]
"""

import pathlib
import sys

RELEASE_BLOCK = """        release {
            storeFile file(FOCUS_STORE_FILE)
            storePassword FOCUS_STORE_PASSWORD
            keyAlias FOCUS_KEY_ALIAS
            keyPassword FOCUS_KEY_PASSWORD
        }
"""


def block_span(text: str, header: str, start: int = 0) -> tuple[int, int]:
    """
    Étendue du bloc `header { ... }`, accolades imbriquées comprises.

    Une expression régulière ne convient pas ici : `buildTypes` contient
    `debug { }` et `release { }`, et un motif non gourmand s'arrête sur la
    première accoraude fermante venue, c'est-à-dire au milieu du bloc.
    Renvoie (index du `{`, index juste après le `}` correspondant).
    """
    head = text.index(header, start)
    open_brace = text.index("{", head)
    depth = 0
    for i in range(open_brace, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return open_brace, i + 1
    raise ValueError(f"accolade fermante manquante pour {header!r}")


def main() -> int:
    android = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "android")
    gradle = android / "app" / "build.gradle"

    if not gradle.is_file():
        print(f"introuvable : {gradle}", file=sys.stderr)
        return 1

    text = gradle.read_text()
    changed = False

    # 1. Déclarer le signingConfig `release` s'il manque.
    try:
        sc_open, sc_close = block_span(text, "signingConfigs")
    except (ValueError, IndexError):
        print("bloc signingConfigs introuvable", file=sys.stderr)
        return 1

    if "FOCUS_STORE_FILE" in text[sc_open:sc_close]:
        print("signingConfigs.release deja present")
    else:
        insert = text.index("\n", sc_open) + 1
        text = text[:insert] + RELEASE_BLOCK + text[insert:]
        changed = True
        print("signingConfigs.release ajoute")

    # 2. Repointer le buildType release, sans toucher au buildType debug.
    try:
        bt_open, bt_close = block_span(text, "buildTypes")
        rel_open, rel_close = block_span(text, "release", bt_open)
    except (ValueError, IndexError):
        print("bloc buildTypes/release introuvable", file=sys.stderr)
        return 1

    release_body = text[rel_open:rel_close]
    if "signingConfigs.release" in release_body:
        print("buildTypes.release utilise deja la cle de release")
    elif "signingConfigs.debug" in release_body:
        patched = release_body.replace("signingConfigs.debug", "signingConfigs.release", 1)
        text = text[:rel_open] + patched + text[rel_close:]
        changed = True
        print("buildTypes.release repointe vers signingConfigs.release")
    else:
        print("aucun signingConfig dans buildTypes.release", file=sys.stderr)
        return 1

    if changed:
        gradle.write_text(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
