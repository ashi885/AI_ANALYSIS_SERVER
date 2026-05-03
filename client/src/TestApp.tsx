import React from 'react';

export default function TestApp() {
    console.log('[TestApp] I AM RUNNING!');
    return (
        <div style={{ padding: '50px', backgroundColor: '#000', color: '#0f0', height: '100vh' }}>
            <h1>TEST APP WORKS!</h1>
            <p>If you see this, React is working.</p>
        </div>
    );
}
