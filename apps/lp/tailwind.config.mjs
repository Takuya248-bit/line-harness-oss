/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        cyan: {
          500: '#06B6D4',
          600: '#0891B2',
        },
        emerald: {
          500: '#10B981',
          600: '#059669',
        },
      },
    },
  },
  plugins: [],
};
