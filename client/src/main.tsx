import React from 'react'
import ReactDOM from 'react-dom/client'
import WrappedApp from './App'  // ✅ No .tsx extension
import './index.css'

// ✅ Removed references to undefined 'App'

const root = document.getElementById('root');
console.log('[main.tsx] Root element:', root);

if (root) {
    try {
        console.log('[main.tsx] About to call ReactDOM.createRoot');
        const reactRoot = ReactDOM.createRoot(root);
        console.log('[main.tsx] Got root:', reactRoot);

        console.log('[main.tsx] About to call render');
        reactRoot.render(
            <React.StrictMode>
                <WrappedApp />
            </React.StrictMode>,
        );
        console.log('[main.tsx] render() called successfully');
    } catch (err) {
        console.error('[main.tsx] Error during render:', err);
    }
} else {
    console.error('[main.tsx] Root element NOT FOUND!');
}