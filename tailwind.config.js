import scrollbar from 'tailwind-scrollbar'

/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                background: '#09090b', // Zinc 950
                surface: '#18181b', // Zinc 900
                primary: '#22d3ee', // Cyan 400
                secondary: '#f472b6', // Pink 400
                accent: '#818cf8', // Indigo 400
                text: '#fafafa', // Zinc 50
                'text-dim': '#a1a1aa', // Zinc 400
            },
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
            },
        },
    },
    plugins: [
        scrollbar,
    ],
}
