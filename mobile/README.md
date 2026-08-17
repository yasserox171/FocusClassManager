# Focus Salles — application mobile

Application **React Native (Expo SDK 57)** pour le système FAAS du Centre Focus Safi.
Bilingue **arabe (RTL)** / **français (LTR)**, consultation publique sans compte,
modification réservée à l'administrateur.

---

## Ce que fait l'application

| Écran | Contenu |
| --- | --- |
| **Tableau de bord** | 8 compteurs (salles, disponibles, occupées, maintenance, réservations du jour et de la semaine, en cours, incidents), alertes en direct, prochaines réservations |
| **Réservations** | Liste filtrable (à venir / historique / toutes), salle, créneau, récurrence, annulation pour l'administrateur |
| **Salles** | Recherche, capacité, état, incidents ouverts, inventaire des ressources dépliable |
| **Employés** | Annuaire avec rôle, département et salles gérées |
| **Statistiques** | Taux d'occupation par salle, heures de pointe, répartition par jour, réservations dans le temps, ressources les plus demandées |

La consultation ne demande **aucun compte** — c'est la même règle que le site.
Le bouton **Connexion** en haut à droite ouvre l'authentification administrateur ;
une fois connecté, les actions d'écriture apparaissent.

---

## Configuration du serveur

L'adresse de l'API est lue depuis `EXPO_PUBLIC_API_URL`, avec le repli défini dans
[`src/config.ts`](src/config.ts). **Il faut la définir au moment du build** :

```bash
EXPO_PUBLIC_API_URL=https://votre-domaine.ma/api npx expo run:android --variant release
```

Gardez le `/api` final. En HTTPS, rien d'autre à faire. En **HTTP simple**, Android
bloque le trafic en clair : il faut ajouter `usesCleartextTraffic` dans
`app.json` (`expo.android.usesCleartextTraffic: true`) puis relancer `expo prebuild`.

---

## Développement

```bash
npm install
npx expo start          # puis scanner le QR code avec Expo Go
```

---

## Build Android (APK)

Prérequis : JDK 17 et le SDK Android (`platform-tools`, `platforms;android-35`,
`build-tools;35.0.0`). Le NDK est installé automatiquement au premier build.

> ### ⚠️ Machine ARM64 (aarch64)
>
> Google ne distribue le **NDK et CMake d'Android que pour `linux-x86_64`**.
> Sur une machine ARM64 — dont ce serveur — la compilation C++ échoue avec un
> message trompeur :
>
> ```
> cmake: 1: Syntax error: ")" unexpected
> ```
>
> C'est un binaire x86_64 que le shell essaie de lire comme un script. React Native
> 0.86 (nouvelle architecture) **doit** compiler du C++ : on ne peut pas contourner.
>
> Solutions : compiler sur une machine x86_64, utiliser `eas build`, ou émuler —
> `apt install qemu-user-static binfmt-support` puis lancer le build dans un
> conteneur `--platform linux/amd64` avec le SDK monté (voir
> `docs/` ou l'historique du projet). L'émulation fonctionne mais reste lente.

> `@react-native-community/cli` est une dépendance de développement **obligatoire** :
> le plugin Gradle de React Native l'appelle pendant la configuration pour lier les
> modules natifs non-Expo (`react-native-screens`, `react-native-svg`,
> `react-native-safe-area-context`, `async-storage`). Sans lui, le build échoue sur
> un laconique `Process 'command 'node'' finished with non-zero exit value 1`.

```bash
export ANDROID_HOME=$HOME/Android/Sdk
npx expo prebuild --platform android --clean
cd android && ./gradlew :app:assembleRelease
```

APK produit : `android/app/build/outputs/apk/release/app-release.apk`

### Signature

Le dossier `android/` est régénéré par `expo prebuild` et **n'est pas versionné**.
La clé de signature vit dans `android/app/release.keystore`, ses identifiants dans
`android/gradle.properties` (ignorés par git).

> **Sauvegardez le fichier `release.keystore` et son mot de passe hors du projet.**
> Sans eux, il devient impossible de publier une mise à jour de la même application
> sur le Play Store — Google refuse un APK signé par une autre clé.

Si les propriétés `FOCUS_*` sont absentes, le build retombe sur la clé de debug :
l'APK s'installe mais n'est pas publiable.

---

## Build iOS

**Impossible sous Linux.** Compiler un `.ipa` demande macOS et Xcode.
Le projet Xcode est déjà généré dans `ios/` et prêt à ouvrir :

```bash
# sur un Mac, à la racine de mobile/
npm install
npx pod-install            # ou: cd ios && pod install
open ios/FocusSalles.xcworkspace
```

Puis dans Xcode : choisir l'équipe de signature, *Product → Archive*.

Sans Mac, utilisez le build cloud d'Expo :

```bash
npm install -g eas-cli
eas login
eas build --platform ios --profile production
```

Identifiants de l'application : `ma.centrefocus.salles` (iOS et Android).

---

## Structure

```
src/
  api/client.ts       axios, jeton JWT, rafraîchissement, erreurs DRF
  api/services.ts     un module par ressource de l'API
  context/            session (navigation anonyme par défaut)
  i18n/               fr.json et ar.json, partagés avec le site web
  utils/direction.ts  RTL géré à la main, bascule instantanée
  utils/datetime.ts   heures toujours affichées à l'heure du centre
  components/         cartes, badges, boutons, graphiques SVG
  screens/            un fichier par écran
```

Les types de `src/types.ts` sont copiés depuis `frontend/src/types/index.ts` :
ils décrivent le même contrat d'API. Si le backend change, mettez les deux à jour.
