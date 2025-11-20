'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';

interface User {
    id: string;
    email: string;
}

interface AuthContextType {
    user: User | null;
    login: (email: string, password: string) => Promise<void>;
    register: (email: string, password: string, securityQuestion: string, securityAnswer: string) => Promise<void>;
    recover: (email: string, securityAnswer: string, newPassword: string) => Promise<void>;
    logout: () => void;
    getSecurityQuestion: (email: string) => Promise<string>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const router = useRouter();

    useEffect(() => {
        const storedUser = localStorage.getItem('audio_stream_user');
        if (storedUser) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setUser(JSON.parse(storedUser));
        }
    }, []);

    const login = async (email: string, password: string) => {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error || 'Login failed');
        }

        const data = await res.json();
        setUser(data.user);
        localStorage.setItem('audio_stream_user', JSON.stringify(data.user));
        router.push('/studio');
    };

    const register = async (email: string, password: string, securityQuestion: string, securityAnswer: string) => {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, securityQuestion, securityAnswer }),
        });

        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error || 'Registration failed');
        }

        const data = await res.json();
        setUser(data.user);
        localStorage.setItem('audio_stream_user', JSON.stringify(data.user));
        router.push('/studio');
    };

    const recover = async (email: string, securityAnswer: string, newPassword: string) => {
        const res = await fetch('/api/auth/recover', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, securityAnswer, newPassword }),
        });

        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error || 'Recovery failed');
        }
    };

    const getSecurityQuestion = async (email: string) => {
        const res = await fetch(`/api/auth/question?email=${encodeURIComponent(email)}`);
        if (!res.ok) {
            throw new Error('User not found');
        }
        const data = await res.json();
        return data.question;
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('audio_stream_user');
        router.push('/login');
    };

    return (
        <AuthContext.Provider value={{ user, login, register, recover, logout, getSecurityQuestion }}>
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
