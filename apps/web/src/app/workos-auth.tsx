/**
 * WorkOS AuthKit Integration for Sistem Informasi Akademik Berkarakter
 *
 * This module provides WorkOS SSO authentication as an alternative
 * login method alongside the existing username/password authentication.
 */

import { useAuth, type User as WorkOSUser } from '@workos-inc/authkit-react';
import { useEffect, useCallback } from 'react';

export type { WorkOSUser };

/**
 * Hook to handle WorkOS authentication state and actions
 */
export function useWorkOSAuth() {
  const {
    isLoading,
    user: workosUser,
    signIn,
    signUp,
    signOut,
    getAccessToken,
    organizationId,
    role,
    permissions,
  } = useAuth();

  return {
    isLoading,
    workosUser,
    signIn,
    signUp,
    signOut,
    getAccessToken,
    organizationId,
    role,
    permissions,
  };
}

/**
 * WorkOS Login Route Handler
 *
 * This component handles the /login route when WorkOS initiates
 * authentication flows (e.g., impersonation, SSO-initiated login).
 */
export function WorkOSLoginHandler() {
  const { signIn, isLoading } = useAuth();

  useEffect(() => {
    // Handle /login route for WorkOS-initiated flows
    if (window.location.pathname === '/login' && window.location.search.includes('workos=true')) {
      signIn();
    }
  }, [signIn]);

  if (isLoading) {
    return (
      <div className="state" style={{ padding: '2rem', textAlign: 'center' }}>
        Mengarahkan ke halaman login...
      </div>
    );
  }

  return null;
}

/**
 * WorkOS SSO Button Component
 *
 * A styled button for initiating WorkOS SSO login
 */
export function WorkOSSSOButton({
  className = '',
  disabled = false,
  returnTo,
}: {
  className?: string;
  disabled?: boolean;
  returnTo?: string;
}) {
  const { signIn, isLoading } = useAuth();

  const handleSSOLogin = useCallback(() => {
    signIn({
      state: returnTo ? { returnTo } : undefined,
    });
  }, [signIn, returnTo]);

  return (
    <button
      type="button"
      className={`btn primary ${className}`}
      onClick={handleSSOLogin}
      disabled={disabled || isLoading}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
      }}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
        <polyline points="10 17 15 12 10 7" />
        <line x1="15" y1="12" x2="3" y2="12" />
      </svg>
      {isLoading ? 'Mengarahkan...' : 'Masuk dengan SSO'}
    </button>
  );
}

/**
 * WorkOS Sign Up Button Component
 */
export function WorkOSSignUpButton({
  className = '',
  disabled = false,
}: {
  className?: string;
  disabled?: boolean;
}) {
  const { signUp, isLoading } = useAuth();

  return (
    <button
      type="button"
      className={`btn ghost ${className}`}
      onClick={() => signUp()}
      disabled={disabled || isLoading}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
      }}
    >
      {isLoading ? 'Mengarahkan...' : 'Daftar Akun Baru'}
    </button>
  );
}

/**
 * WorkOS Sign Out Handler
 *
 * Signs out from both WorkOS and clears local app state
 */
export function useWorkOSSignOut(onLocalSignOut?: () => void) {
  const { signOut } = useAuth();

  const handleSignOut = useCallback(() => {
    // Clear local app state first
    onLocalSignOut?.();

    // Then sign out from WorkOS
    signOut({
      returnTo: window.location.origin + '/login',
    });
  }, [signOut, onLocalSignOut]);

  return handleSignOut;
}

/**
 * WorkOS User Info Display Component
 */
export function WorkOSUserInfo() {
  const { workosUser, isLoading } = useWorkOSAuth();

  if (isLoading) {
    return <div className="state faint">Loading...</div>;
  }

  if (!workosUser) {
    return null;
  }

  return (
    <div className="workos-user-info">
      <div className="row" style={{ gap: '12px', alignItems: 'center' }}>
        {workosUser.profilePictureUrl && (
          <img
            src={workosUser.profilePictureUrl}
            alt={workosUser.firstName || workosUser.email}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              objectFit: 'cover',
            }}
          />
        )}
        <div>
          <div style={{ fontWeight: 500 }}>
            {workosUser.firstName} {workosUser.lastName}
          </div>
          <div className="faint" style={{ fontSize: '12px' }}>
            {workosUser.email}
          </div>
        </div>
      </div>
    </div>
  );
}
