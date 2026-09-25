import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Organization } from '../types/index.js';
import { api } from '../services/api.js';

interface AuthContextType {
  user: User | null;
  organizations: Organization[];
  activeOrg: Organization | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (payload: { email: string; password: string; name: string; organizationName?: string }) => Promise<void>;
  logout: () => Promise<void>;
  setActiveOrg: (org: Organization) => void;
  refreshOrganizations: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [activeOrg, setActiveOrgState] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const initAuth = async () => {
    const token = localStorage.getItem('documind_access_token');
    if (!token) {
      setIsLoading(false);
      return;
    }

    try {
      const me = await api.getMe();
      setUser(me.user);
      setOrganizations(me.organizations);

      const savedOrgId = localStorage.getItem('documind_active_org_id');
      const found = me.organizations.find((o) => o.id === savedOrgId) || me.organizations[0];
      if (found) {
        setActiveOrgState(found);
        localStorage.setItem('documind_active_org_id', found.id);
      }
    } catch {
      localStorage.removeItem('documind_access_token');
      localStorage.removeItem('documind_refresh_token');
      localStorage.removeItem('documind_active_org_id');
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    initAuth();
  }, []);

  const setActiveOrg = (org: Organization) => {
    setActiveOrgState(org);
    localStorage.setItem('documind_active_org_id', org.id);
    // Reload components to reflect new tenant
    window.location.reload();
  };

  const refreshOrganizations = async () => {
    try {
      const orgs = await api.listOrganizations();
      setOrganizations(orgs);
      if (activeOrg) {
        const updated = orgs.find((o) => o.id === activeOrg.id);
        if (updated) setActiveOrgState(updated);
      }
    } catch (e) {
      console.error('Failed to refresh organizations', e);
    }
  };

  const login = async (email: string, password: string) => {
    const result = await api.login({ email, password });
    localStorage.setItem('documind_access_token', result.tokens.accessToken);
    localStorage.setItem('documind_refresh_token', result.tokens.refreshToken);
    setUser(result.user);
    setOrganizations(result.organizations);

    if (result.organizations.length > 0) {
      setActiveOrgState(result.organizations[0]);
      localStorage.setItem('documind_active_org_id', result.organizations[0].id);
    }
  };

  const signup = async (payload: { email: string; password: string; name: string; organizationName?: string }) => {
    const result = await api.signup(payload);
    localStorage.setItem('documind_access_token', result.tokens.accessToken);
    localStorage.setItem('documind_refresh_token', result.tokens.refreshToken);
    setUser(result.user);
    setOrganizations([result.organization]);
    setActiveOrgState(result.organization);
    localStorage.setItem('documind_active_org_id', result.organization.id);
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // ignore
    }
    setUser(null);
    setOrganizations([]);
    setActiveOrgState(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        organizations,
        activeOrg,
        isLoading,
        login,
        signup,
        logout,
        setActiveOrg,
        refreshOrganizations,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
