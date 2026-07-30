// SS-EXTERIOR-CRM-BUILD-63597066
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppProvider } from "./context/AppContext.jsx";
import Layout from "./components/Layout.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import CalendarPage from "./pages/CalendarPage.jsx";
import Clients from "./pages/Clients.jsx";
import Jobs from "./pages/Jobs.jsx";
import Quotes from "./pages/Quotes.jsx";
import Invoices from "./pages/Invoices.jsx";
import Inbox from "./pages/Inbox.jsx";
import PnL from "./pages/PnL.jsx";
import Reports from "./pages/Reports.jsx";
import Receipts from "./pages/Receipts.jsx";
import Campaigns from "./pages/Campaigns.jsx";
import AIAssistant from "./pages/AIAssistant.jsx";
import Autopilot from "./pages/Autopilot.jsx";
import FinanceHub from "./components/FinanceHub.jsx";

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{padding:32,fontFamily:"monospace",background:"#fff",minHeight:"100vh"}}>
          <h2 style={{color:"#c62828"}}>⚠️ CRM Error — share this with Claude</h2>
          <pre style={{background:"#f5f5f5",padding:16,borderRadius:8,overflow:"auto",fontSize:12,whiteSpace:"pre-wrap"}}>
            {this.state.error?.toString()}{"\n\n"}{this.state.error?.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
    <AppProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/clients" element={<Clients />} />
            <Route path="/clients/:clientId" element={<Clients />} />
            <Route path="/jobs" element={<Jobs />} />
            <Route path="/quotes" element={<Quotes />} />
            <Route path="/invoices" element={<Invoices />} />
            <Route path="/inbox" element={<Inbox />} />
            <Route path="/p&l" element={<PnL />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/receipts" element={<Receipts />} />
            <Route path="/campaigns" element={<Campaigns />} />
            <Route path="/ai" element={<AIAssistant />} />
            <Route path="/autopilot" element={<Autopilot />} />
            <Route path="/finance" element={<FinanceHub />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </AppProvider>
    </ErrorBoundary>
  );
}
