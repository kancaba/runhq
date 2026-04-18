#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "usage: $0 <version>  (e.g. $0 0.1.0)"
  exit 1
fi

VERSION="$1"
TAG="v${VERSION}"
GITHUB_OWNER="erdembas"
GITHUB_REPO="RunHQ"
PKG_ID="${GITHUB_OWNER}.RunHQ"
PUBLISHER="Erdem Bas"
PRODUCT="RunHQ"
DESC="The universal local service orchestrator."
HOMEPAGE="https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}"
LICENSE="MIT"
RELEASE_BASE="https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${TAG}"

MSI_URL="${RELEASE_BASE}/RunHQ_${VERSION}_x64_en-US.msi"
MSI_SHA256=$(curl -sL "$MSI_URL" | shasum -a 256 | cut -d' ' -f1)

if [ -z "$MSI_SHA256" ]; then
  echo "ERROR: could not download/hash MSI from $MSI_URL"
  echo "Make sure the release $TAG exists and has the MSI asset."
  exit 1
fi

OUTDIR="winget-manifests/${VERSION}"
mkdir -p "$OUTDIR"

cat > "${OUTDIR}/${PKG_ID}.yaml" <<EOF
PackageIdentifier: ${PKG_ID}
PackageVersion: ${VERSION}
DefaultLocale: en-US
ManifestType: version
ManifestVersion: 1.6.0
EOF

cat > "${OUTDIR}/${PKG_ID}.installer.yaml" <<EOF
PackageIdentifier: ${PKG_ID}
PackageVersion: ${VERSION}
Platform:
- Windows.Desktop
MinimumOSVersion: 10.0.17763.0
InstallerType: wix
Scope: machine
InstallModes:
- interactive
- silent
- silentWithProgress
UpgradeBehavior: install
Dependencies:
  PackageDependencies:
  - PackageIdentifier: Microsoft.VCRedist.2015+.x64
Installers:
- Architecture: x64
  InstallerUrl: ${MSI_URL}
  InstallerSha256: ${MSI_SHA256}
  InstallerLocale: en-US
  ProductCode: "{REPLACE_WITH_PRODUCT_CODE_GUID}"
ManifestType: installer
ManifestVersion: 1.6.0
EOF

cat > "${OUTDIR}/${PKG_ID}.locale.en-US.yaml" <<EOF
PackageIdentifier: ${PKG_ID}
PackageVersion: ${VERSION}
PackageLocale: en-US
Publisher: ${PUBLISHER}
PublisherUrl: ${HOMEPAGE}
PublisherSupportUrl: ${HOMEPAGE}/issues
Author: ${PUBLISHER}
PackageName: ${PRODUCT}
PackageUrl: ${HOMEPAGE}
License: ${LICENSE}
LicenseUrl: ${HOMEPAGE}/blob/main/LICENSE
Copyright: Copyright (c) ${GITHUB_OWNER}
ShortDescription: ${DESC}
Description: ${DESC} - RunHQ manages native local dev processes (Node, Go, .NET, Python, Docker Compose) from a single UI with port watchdog, unified logs, and stacks.
Moniker: runhq
Tags:
- developer-tools
- process-manager
- service-orchestrator
- tauri
ReleaseNotesUrl: ${HOMEPAGE}/releases/tag/${TAG}
ManifestType: defaultLocale
ManifestVersion: 1.6.0
EOF

echo ""
echo "Winget manifests created in ${OUTDIR}/"
echo ""
echo "Next steps:"
echo "  1. Fork https://github.com/microsoft/winget-pkgs"
echo "  2. Copy ${OUTDIR}/ -> manifests/${GITHUB_OWNER}/${PRODUCT}/${VERSION}/"
echo "  3. Replace {REPLACE_WITH_PRODUCT_CODE_GUID} in the installer manifest"
echo "     (get it from the MSI: installerstream lessmsi l -t ProductCode ... or orca)"
echo "  4. Commit, push, and open a PR against winget-pkgs"
