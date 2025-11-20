import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

export async function POST(request: Request) {
    try {
        const { username, password } = await request.json();

        // Get credentials from environment variables
        const validUsername = process.env.ADMIN_USERNAME || 'admin';
        const validPasswordHash = process.env.ADMIN_PASSWORD_HASH;

        if (!validPasswordHash) {
            return NextResponse.json(
                { error: 'Server configuration error' },
                { status: 500 }
            );
        }

        // Validate username
        if (username !== validUsername) {
            return NextResponse.json(
                { error: 'Invalid credentials' },
                { status: 401 }
            );
        }

        // Validate password
        const isValid = await bcrypt.compare(password, validPasswordHash);

        if (!isValid) {
            return NextResponse.json(
                { error: 'Invalid credentials' },
                { status: 401 }
            );
        }

        // Return success with user data
        return NextResponse.json({
            success: true,
            user: { username: validUsername }
        });

    } catch (error) {
        console.error('Login error:', error);
        return NextResponse.json(
            { error: 'Authentication failed' },
            { status: 500 }
        );
    }
}
