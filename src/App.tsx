import { useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Lobby from "./pages/Lobby";
import CanvasPage from "./pages/Index";
import LibraryPage from "./pages/LibraryPage";
import Install from "./pages/Install";
import NotFound from "./pages/NotFound";
import PasswordGate from "./components/PasswordGate";

const queryClient = new QueryClient();

const App = () => {
  const [unlocked, setUnlocked] = useState(
    () => sessionStorage.getItem('canvas_unlocked') === '1'
  );

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
            <Route path="/install" element={<Install />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
