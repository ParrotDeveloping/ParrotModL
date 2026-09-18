# ParrotModL

A free, open-source Minecraft: Java Edition mod launcher with built-in Modrinth and
CurseForge browsing. Windows, built with Electron.

> **Status:** personal, non-commercial project. Microsoft sign-in is pending
> Mojang AppID approval; offline (local username) mode works today for
> singleplayer and LAN.

---

## What it does

- **Instances / profiles** — each profile is an isolated game folder with its own
  mods, config, worlds, screenshots, RAM and resolution settings. Create one by
  picking a mod loader, a Minecraft version, a loader version, a name and an icon.
- **Mod loaders** — Vanilla, Fabric, Quilt, Forge and NeoForge. Loader versions are
  fetched live from the official metadata endpoints and installed automatically.
- **Content browsing** — search Modrinth and CurseForge side by side for mods,
  resource packs, shaders, modpacks and datapacks. Install into a profile (with
  required dependencies resolved recursively at compatible versions) or download
  a single file to a folder you pick.
- **Compatibility checks** — before installing, each profile is checked against the
  file's game versions and loaders, and incompatible profiles say exactly why.
- **Modpacks** — install packs straight from Modrinth or CurseForge, import
  `.mrpack` and CurseForge `.zip` packs, and export any profile as a `.mrpack`
  that other Modrinth-compatible launchers can open.
- **Skins** — keep a local skin library, preview it on a draggable 3D player model,
  apply it to your Microsoft account, and pick a cape.
- **Screenshots** — every screenshot from every profile in one gallery.
- **Java** — the right Java version for each Minecraft version is detected on the
  system, or downloaded from Adoptium automatically.
- **Theming** — accent colour, three themes, background image, UI scale.

## Accounts and authentication

ParrotModL uses the standard Microsoft OAuth 2.0 **device code flow** with no client
secret, followed by the normal Xbox Live → XSTS → Minecraft Services chain. It reads
the player profile (UUID and username) to build a valid launch session, checks the
account's Minecraft: Java Edition entitlement, and uses the profile skin/cape
endpoints so the user can change their own appearance.

Refresh tokens are stored only on the user's own machine and are sent only to
official Microsoft and Mojang endpoints. There is no telemetry, no account server of
our own, and no third party ever sees a token.

A **local/offline username mode** exists for singleplayer and LAN, as in other
established launchers. It issues no session token, so online servers correctly reject
it — it is not an alternative to signing in, and it does not bypass, weaken or
disable any authentication, entitlement, license or safety check.

## Install

Download the installer from [Releases](../../releases) and run it. The app is not
code-signed, so Windows SmartScreen may warn once — choose
*More info → Run anyway*.

## Build from source

```bash
npm install
npm start      # run in development
npm run dist   # produce a Windows installer in dist/
npx electron test/backend-test.js   # run the backend test suite
```

## Project layout

```
src/main/          main process (Node)
  api/             Modrinth, CurseForge, unified content layer
  auth/            Microsoft device-code flow, account store
  game/            version metadata, loader install, Java, downloads, launching
  profiles.js      profile CRUD, mod install, .mrpack export/import
  skins.js         skin library + Minecraft Services skin/cape API
src/renderer/      UI (plain HTML/CSS/JS, no build step)
  views/           one file per tab
test/              backend tests
```

## Legal

Not affiliated with, endorsed by, or associated with Mojang Studios or Microsoft.
Minecraft is a trademark of Mojang Studios. No game files are redistributed; all
game assets are downloaded from Mojang's own servers at install time, and mods are
downloaded from Modrinth and CurseForge.

Licensed under the MIT License.

---

## Türkçe

ParrotModL, Modrinth ve CurseForge desteğiyle gelen ücretsiz ve açık kaynaklı bir
Minecraft: Java Edition mod launcher'ıdır.

Profil başına ayrı mod/dünya/ayar klasörü, Fabric–Quilt–Forge–NeoForge kurulumu,
bağımlılıklarıyla birlikte mod indirme, `.mrpack` dışa/içe aktarma, 3B önizlemeli
skin kütüphanesi, tüm profillerden ekran görüntüsü galerisi ve otomatik Java
yönetimi sunar.

Kurulum dosyasını [Releases](../../releases) sayfasından indirip çalıştırman yeterli.
Microsoft girişi Mojang onayı bekliyor; o gelene kadar çevrimdışı hesapla tek
oyunculu ve modlu oyun eksiksiz çalışır.
