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
            git
            wrangler
            # For sharp and other native modules
            vips
            pkg-config
          ];

          shellHook = ''
            export SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt
            export LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath [ pkgs.stdenv.cc.cc.lib pkgs.vips ]}:$LD_LIBRARY_PATH"
          '';
        };
      }
    );
}
