// SOLIDEO Design System — Tailwind preset (1.3.2)
// 자동 생성 파일입니다(생성기: scripts/build-tailwind-theme.mjs — 손으로 고치지 마세요). solideo-tokens.css 를 함께 불러와야 var() 가 해석됩니다.
// 화면 폭(screens: tablet·desktop·wide)은 Tailwind 기본 폭(sm·md·lg…)에 더해집니다. 기본 폭과 섞어 쓰지 말고 한쪽만 쓰세요.
module.exports = {
  "theme": {
    "extend": {
      "colors": {
        "text": {
          "primary": "var(--text-primary)",
          "secondary": "var(--text-secondary)",
          "tertiary": "var(--text-tertiary)",
          "disabled": "var(--text-disabled)",
          "inverse": "var(--text-inverse)",
          "accent": "var(--text-accent)",
          "critical": "var(--text-critical)",
          "positive": "var(--text-positive)",
          "caution": "var(--text-caution)",
          "info": "var(--text-info)"
        },
        "bg": {
          "primary": "var(--bg-primary)",
          "secondary": "var(--bg-secondary)",
          "tertiary": "var(--bg-tertiary)",
          "inverse": "var(--bg-inverse)",
          "dim": "var(--bg-dim)"
        },
        "fill": {
          "primary": "var(--fill-primary)",
          "secondary": "var(--fill-secondary)",
          "tertiary": "var(--fill-tertiary)",
          "accent": "var(--fill-accent)",
          "accent-hover": "var(--fill-accent-hover)",
          "accent-pressed": "var(--fill-accent-pressed)",
          "accent-subtle": "var(--fill-accent-subtle)",
          "disabled": "var(--fill-disabled)",
          "critical": "var(--fill-critical)",
          "critical-subtle": "var(--fill-critical-subtle)",
          "positive-subtle": "var(--fill-positive-subtle)",
          "caution-subtle": "var(--fill-caution-subtle)",
          "info-subtle": "var(--fill-info-subtle)"
        },
        "border": {
          "primary": "var(--border-primary)",
          "secondary": "var(--border-secondary)",
          "strong": "var(--border-strong)",
          "accent": "var(--border-accent)",
          "critical": "var(--border-critical)",
          "focus": "var(--border-focus)"
        },
        "icon": {
          "primary": "var(--icon-primary)",
          "secondary": "var(--icon-secondary)",
          "tertiary": "var(--icon-tertiary)",
          "accent": "var(--icon-accent)",
          "inverse": "var(--icon-inverse)"
        },
        "gray": {
          "25": "var(--gray-25)",
          "50": "var(--gray-50)",
          "75": "var(--gray-75)",
          "100": "var(--gray-100)",
          "150": "var(--gray-150)",
          "200": "var(--gray-200)",
          "250": "var(--gray-250)",
          "300": "var(--gray-300)",
          "350": "var(--gray-350)",
          "400": "var(--gray-400)",
          "450": "var(--gray-450)",
          "500": "var(--gray-500)",
          "550": "var(--gray-550)",
          "600": "var(--gray-600)",
          "650": "var(--gray-650)",
          "700": "var(--gray-700)",
          "750": "var(--gray-750)",
          "800": "var(--gray-800)",
          "850": "var(--gray-850)",
          "900": "var(--gray-900)"
        },
        "crimson": {
          "100": "var(--crimson-100)",
          "150": "var(--crimson-150)",
          "200": "var(--crimson-200)",
          "300": "var(--crimson-300)",
          "400": "var(--crimson-400)",
          "500": "var(--crimson-500)",
          "600": "var(--crimson-600)",
          "700": "var(--crimson-700)",
          "800": "var(--crimson-800)"
        },
        "ink": {
          "100": "var(--ink-100)",
          "150": "var(--ink-150)",
          "200": "var(--ink-200)",
          "300": "var(--ink-300)",
          "400": "var(--ink-400)",
          "500": "var(--ink-500)",
          "600": "var(--ink-600)",
          "700": "var(--ink-700)",
          "800": "var(--ink-800)"
        },
        "green": {
          "100": "var(--green-100)",
          "150": "var(--green-150)",
          "200": "var(--green-200)",
          "300": "var(--green-300)",
          "400": "var(--green-400)",
          "500": "var(--green-500)",
          "600": "var(--green-600)",
          "700": "var(--green-700)",
          "800": "var(--green-800)"
        },
        "blue": {
          "100": "var(--blue-100)",
          "150": "var(--blue-150)",
          "200": "var(--blue-200)",
          "300": "var(--blue-300)",
          "400": "var(--blue-400)",
          "500": "var(--blue-500)",
          "600": "var(--blue-600)",
          "700": "var(--blue-700)",
          "800": "var(--blue-800)"
        },
        "amber": {
          "100": "var(--amber-100)",
          "150": "var(--amber-150)",
          "200": "var(--amber-200)",
          "300": "var(--amber-300)",
          "400": "var(--amber-400)",
          "500": "var(--amber-500)",
          "600": "var(--amber-600)",
          "700": "var(--amber-700)",
          "800": "var(--amber-800)"
        },
        "red": {
          "100": "var(--red-100)",
          "150": "var(--red-150)",
          "200": "var(--red-200)",
          "300": "var(--red-300)",
          "400": "var(--red-400)",
          "500": "var(--red-500)",
          "600": "var(--red-600)",
          "700": "var(--red-700)",
          "800": "var(--red-800)"
        },
        "accent": {
          "primary": "var(--accent-primary)",
          "secondary": "var(--accent-secondary)"
        },
        "static": {
          "black": "var(--static-black)",
          "white": "var(--static-white)"
        }
      },
      "spacing": {
        "1": "var(--space-1)",
        "2": "var(--space-2)",
        "3": "var(--space-3)",
        "4": "var(--space-4)",
        "5": "var(--space-5)",
        "6": "var(--space-6)",
        "8": "var(--space-8)",
        "10": "var(--space-10)",
        "12": "var(--space-12)",
        "16": "var(--space-16)",
        "20": "var(--space-20)",
        "24": "var(--space-24)"
      },
      "borderRadius": {
        "xs": "var(--radius-xs)",
        "sm": "var(--radius-sm)",
        "md": "var(--radius-md)",
        "lg": "var(--radius-lg)",
        "xl": "var(--radius-xl)",
        "full": "var(--radius-full)"
      },
      "boxShadow": {
        "1": "var(--shadow-1)",
        "2": "var(--shadow-2)",
        "3": "var(--shadow-3)",
        "4": "var(--shadow-4)"
      },
      "fontFamily": {
        "sans": "var(--font-family-sans)",
        "mono": "var(--font-family-mono)"
      },
      "fontSize": {
        "display": "var(--font-size-display)",
        "h1": "var(--font-size-h1)",
        "h2": "var(--font-size-h2)",
        "h3": "var(--font-size-h3)",
        "h4": "var(--font-size-h4)",
        "body-lg": "var(--font-size-body-lg)",
        "body": "var(--font-size-body)",
        "sm": "var(--font-size-sm)",
        "xs": "var(--font-size-xs)"
      },
      "fontWeight": {
        "regular": "var(--font-weight-regular)",
        "medium": "var(--font-weight-medium)",
        "bold": "var(--font-weight-bold)",
        "black": "var(--font-weight-black)"
      },
      "lineHeight": {
        "tight": "var(--line-height-tight)",
        "normal": "var(--line-height-normal)",
        "loose": "var(--line-height-loose)"
      },
      "letterSpacing": {
        "tight": "var(--letter-spacing-tight)"
      },
      "transitionDuration": {
        "fast": "var(--duration-fast)",
        "base": "var(--duration-base)",
        "slow": "var(--duration-slow)"
      },
      "transitionTimingFunction": {
        "standard": "var(--easing-standard)",
        "decelerate": "var(--easing-decelerate)"
      },
      "screens": {
        "tablet": "600px",
        "desktop": "900px",
        "wide": "1280px"
      }
    }
  }
};
