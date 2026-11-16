import React from 'react';
import { Button } from './Button';

interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center mb-4">
            <span className="text-red-500 text-xl">!</span>
          </div>
          <p className="text-sm font-bold text-brand-900 mb-1">Something went wrong</p>
          <p className="text-xs text-gray-500 mb-4 max-w-sm font-mono">
            {this.state.error?.message ?? 'Unknown error'}
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
          >
            Reload page
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
