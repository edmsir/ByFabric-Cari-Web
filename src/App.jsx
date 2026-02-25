import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { FilterProvider } from './context/FilterContext';
import { DataProvider } from './context/DataContext';
import { SettingsProvider } from './context/SettingsContext';

import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const MonthlyEvaluation = lazy(() => import('./pages/MonthlyEvaluation'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
const Messages = lazy(() => import('./pages/Messages'));
const SalesCollectionReport = lazy(() => import('./pages/SalesCollectionReport'));
const ExcelImport = lazy(() => import('./pages/ExcelImport'));
const Settings = lazy(() => import('./pages/Settings'));

const PageLoader = () => (
  <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-4">
    <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
    <p className="text-sm font-bold text-gray-400 uppercase tracking-widest animate-pulse">Sayfa Yükleniyor...</p>
  </div>
);

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <FilterProvider>
              <DataProvider>
                <SettingsProvider>
                  <Suspense fallback={<PageLoader />}>
                    <Routes>
                      <Route path="/login" element={<Login />} />

                      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/monthly-evaluation" element={<MonthlyEvaluation />} />
                        <Route path="/users" element={<UserManagement />} />
                        <Route path="/messages" element={<Messages />} />
                        <Route path="/sales-collection" element={<SalesCollectionReport />} />
                        <Route path="/import" element={<ExcelImport />} />
                        <Route path="/settings" element={<Settings />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                      </Route>
                    </Routes>
                  </Suspense>
                </SettingsProvider>
              </DataProvider>
            </FilterProvider>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
