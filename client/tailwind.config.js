/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                background: '#0a0f18',
                card: 'rgba(17, 25, 40, 0.75)',
                primary: '#10b981', // emerald
            },
        },
    },
    plugins: [],
}
