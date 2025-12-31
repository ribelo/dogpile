{
  description = "Dogpile - Dog adoption aggregator";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            bun
            nodejs_22
            nodePackages.wrangler
            patchelf
          ];

          shellHook = ''
            export SSL_CERT_FILE="${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt"
            export NIX_SSL_CERT_FILE="${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt"

            # Patch workerd binary for NixOS compatibility
            __patchWorkerd() {
              local target="$1"
              if [[ -f "$target" && ! -f "$target.patched" ]]; then
                echo "Patching workerd at $target..."
                ${pkgs.patchelf}/bin/patchelf --set-interpreter ${pkgs.glibc}/lib/ld-linux-x86-64.so.2 "$target" 2>/dev/null || true
                touch "$target.patched"
              fi
            }

            # Find and patch all workerd binaries
            for workerd in ./node_modules/.bun/@cloudflare+workerd-linux-64@*/node_modules/@cloudflare/workerd-linux-64/bin/workerd; do
              __patchWorkerd "$workerd"
            done

            echo "Dogpile dev environment ready"
            echo "SSL_CERT_FILE=$SSL_CERT_FILE"
          '';
        };
      }
    );
}
