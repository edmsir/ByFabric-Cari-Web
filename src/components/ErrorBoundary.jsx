import React from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('🔴 Application Crash Caught:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6 text-center">
                    <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-10 space-y-6 border border-red-100">
                        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                            <AlertTriangle className="h-10 w-10 text-red-600" />
                        </div>
                        <div className="space-y-2">
                            <h2 className="text-2xl font-bold text-gray-800">Hay aksi, bir şeyler ters gitti!</h2>
                            <p className="text-gray-500 text-sm">Uygulama beklenmedik bir hata ile karşılaştı. Lütfen sayfayı yenileyin.</p>
                        </div>
                        <button
                            onClick={() => window.location.reload()}
                            className="w-full py-3 bg-red-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
                        >
                            <RefreshCcw size={18} /> Sayfayı Yenile
                        </button>
                        {process.env.NODE_ENV === 'development' && (
                            <div className="p-4 bg-gray-50 rounded-lg text-left text-[10px] font-mono text-gray-400 overflow-auto max-h-32">
                                {this.state.error?.toString()}
                            </div>
                        )}
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
