import { useState, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Lobby from "./pages/Lobby";
import CanvasPage from "./pages/Index";
import LibraryPage from "./pages/LibraryPage";
import DataManagementPage from "./pages/DataManagementPage";
import Install from "./pages/Install";
import NotFound from "./pages/NotFound";
import PasswordGate from "./components/PasswordGate";
import { ThemeChooser, getStoredTheme, applyTheme } from "./components/ThemeSelector";

const queryClient = new QueryClient();

const App = () => {
  const [unlocked, setUnlocked] = useState(false);
  const [themeChosen, setThemeChosen] = useState(
    () => localStorage.getItem('theme_chosen') === '1'
  );

  // Apply stored theme on mount
  useEffect(() => {
    applyTheme(getStoredTheme());
  }, []);

  if (!themeChosen) {
    return <ThemeChooser onChosen={() => setThemeChosen(true)} />;
  }

  if (!unlocked) {
    return <PasswordGate onUnlock={() => setUnlocked(true)} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Lobby />} />
            <Route path="/canvas/:documentId" element={<CanvasPage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/data" element={<DataManagementPage />} />
            <Route path="/install" element={<Install />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
