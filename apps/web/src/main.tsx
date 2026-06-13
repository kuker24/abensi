import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthKitProvider } from '@workos-inc/authkit-react';
import { App } from './App';
import './styles.css';

const workosClientId = import.meta.env.VITE_WORKOS_CLIENT_ID;

if (!workosClientId) {
  console.error('Missing VITE_WORKOS_CLIENT_ID environment variable');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthKitProvider
      clientId={workosClientId}
      onRedirectCallback={({ state }) => {
        // Restore app state after authentication redirect
        if (state?.returnTo) {
          window.location.href = state.returnTo;
        }
      }}
      onRefreshFailure={({ signIn }) => {
        // Session expired - prompt re-authentication
        console.warn('AuthKit session expired, prompting re-authentication');
        signIn();
      }}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AuthKitProvider>
  </React.StrictMode>
);
