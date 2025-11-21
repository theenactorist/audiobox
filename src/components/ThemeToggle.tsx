'use client';

import { ActionIcon, useMantineColorScheme } from '@mantine/core';
import { IconSun, IconMoon } from '@tabler/icons-react';

export function ThemeToggle() {
    const { colorScheme, toggleColorScheme } = useMantineColorScheme();
    const dark = colorScheme === 'dark';

    return (
        <div suppressHydrationWarning style={{ position: 'absolute', top: '1rem', right: '1rem', zIndex: 1000 }}>
            <ActionIcon
                variant="outline"
                color={dark ? 'yellow' : 'blue'}
                onClick={() => toggleColorScheme()}
                title="Toggle color scheme"
            >
                {dark ? <IconSun size={18} /> : <IconMoon size={18} />}
            </ActionIcon>
        </div>
    );
}
