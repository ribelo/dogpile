import type { Config } from "tailwindcss"

export default {
  content: ["./src/**/*.{astro,html,js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        sys: {
          paper: {
            base: "#fbf8f3",
            card: "#fffdfa",
            shadow: "#eaddcf",
          },
          ink: {
            primary: "#4a4238",
          },
          heart: {
            core: "#e07a5f",
            soft: "#f2cc8f",
          },
          cheek: {
            blush: "rgba(224, 122, 95, 0.15)",
          },
          nature: {
            grass: "#81b29a",
            sky: "#a8dadc",
          },
          state: {
            urgent: "#d65d5d",
          },
        },
      },
      fontFamily: {
        title: ["Fraunces", "serif"],
        narrative: ["Quicksand", "sans-serif"],
      },
      animation: {
        breath: "breath 4s ease-in-out infinite",
        wiggle: "wiggle 1s ease-in-out infinite",
        unfold: "unfold 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards",
      },
      keyframes: {
        breath: {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.02)" },
        },
        wiggle: {
          "0%, 100%": { transform: "rotate(-3deg)" },
          "50%": { transform: "rotate(3deg)" },
        },
        unfold: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      borderRadius: {
        paper: "255px 15px 225px 15px / 15px 225px 15px 255px",
        "paper-alt": "15px 255px 15px 225px / 225px 15px 255px 15px",
        "paper-img": "200px 10px 200px 10px / 10px 200px 10px 200px",
        "paper-img-alt": "10px 200px 10px 200px / 200px 10px 200px 10px",
        "paper-oval": "150px 150px 20px 20px / 20px 20px 150px 150px",
      },
      boxShadow: {
        paper: "4px 4px 0 #eaddcf, 8px 8px 0 rgba(0,0,0,0.03)",
        "paper-lift": "8px 8px 0 #eaddcf, 12px 12px 0 rgba(0,0,0,0.05)",
      },
    },
  },
  plugins: [],
} satisfies Config
