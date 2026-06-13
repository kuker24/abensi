import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthKitProvider } from '@workos-inc/authkit-react';
import { App } from './App';
import './styles.css';

const workosClientId = import.meta.env.VITE_WORKOS_CLIENT_ID;
const ssoEnabled = import.meta.env.VITE_SSO_ENABLED === 'true' && Boolean(workosClientId);

const app = (
  <BrowserRouter>
    <App />
  </BrowserRouter>
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {ssoEnabled ? (
      <AuthKitProvider
        clientId={workosClientId}
        onRedirectCallback={({ state }) => {
          if (state?.returnTo) window.location.href = state.returnTo;
        }}
        onRefreshFailure={({ signIn }) => {
          signIn();
        }}
      >
        {app}
      </AuthKitProvider>
    ) : app}
  </React.StrictMode>
);
