
import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

interface AppUser {
    id: string;
    email: string;
}

interface AuthContextType {
    user: AppUser | null;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<void>;
    register: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

import { getServerUrl } from '@/lib/serverUrl';

const API_BASE = getServerUrl();

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<AppUser | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const navigate = useNavigate();

    // Check for existing session on mount
    useEffect(() => {
        const checkSession = async () => {
            const token = localStorage.getItem('audiobox_token');
            if (!token) {
                setIsLoading(false);
                return;
            }

            try {
                const res = await fetch(`${API_BASE}/api/auth/me`, {
                    headers: { Authorization: `Bearer ${token}` },
                });

                if (res.ok) {
                    const data = await res.json();
                    setUser(data.user);
                } else {
                    // Token expired or invalid
                    localStorage.removeItem('audiobox_token');
                }
            } catch (error) {
                console.error('Error checking session:', error);
                localStorage.removeItem('audiobox_token');
            } finally {
                setIsLoading(false);
            }
        };

        checkSession();
    }, []);

    const login = async (email: string, password: string) => {
        const res = await fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || 'Login failed');
        }

        localStorage.setItem('audiobox_token', data.token);
        setUser(data.user);
        navigate('/studio');
    };

    const register = async (email: string, password: string) => {
        const res = await fetch(`${API_BASE}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || 'Registration failed');
        }

        localStorage.setItem('audiobox_token', data.token);
        setUser(data.user);
        navigate('/studio');
    };

    const logout = async () => {
        localStorage.removeItem('audiobox_token');
        setUser(null);
        navigate('/login');
    };

    return (
        <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
