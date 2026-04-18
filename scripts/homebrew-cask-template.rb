cask "runhq" do
  version "0.1.0"
  sha256 "PLACEHOLDER"

  url "https://github.com/erdembas/runhq/releases/download/v#{version}/RunHQ_#{version}_aarch64.dmg"
  name "RunHQ"
  desc "The universal local service orchestrator."
  homepage "https://github.com/erdembas/runhq"

  depends_on macos: ">= :ventura"

  app "RunHQ.app"
end
