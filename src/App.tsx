// src/App.tsx
import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

// Pages (replace "@/pages/..." with relative imports if your project doesn't use the alias)
import Login from "@/pages/Login";
import SignUp from "@/pages/SignUp";
import ConfirmEmail from "@/pages/ConfirmEmail";
import Dashboard from "@/pages/Dashboard";
import AddData from "@/pages/AddData";
import Symptoms from "./pages/Symptoms";
import Reports from "./pages/Reports";

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route index element={<Login />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/confirm" element={<ConfirmEmail />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/add-data" element={<AddData />} />
        <Route path="/symptoms" element={<Symptoms/>}/>
        <Route path="/reports" element={<Reports/>}/>
        {/* Fallback 404 page */}
        <Route path="*" element={<div className="p-8">404 — Page not found</div>} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
