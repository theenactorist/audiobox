import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MantineProvider, createTheme } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { AuthProvider } from './context/AuthContext';
import { ThemeToggle } from './components/ThemeToggle';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Studio from './pages/Studio';
import Listen from './pages/Listen';

const theme = createTheme({
  primaryColor: 'green',
  colors: {
    green: [
      '#e6f7ed',
      '#c2ecd3',
      '#9de1b9',
      '#78d69f',
      '#53cb85',
      '#0FA76A', // Primary shade
      '#0c8556',
      '#096342',
      '#06422d',
      '#032119'
    ]
  }
});

function App() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <Notifications />
      <ThemeToggle />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/signup" element={<Navigate to="/register" replace />} />
            <Route path="/studio" element={<Studio />} />
            <Route path="/listen" element={<Listen />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </MantineProvider>
  );
}

export default App;
