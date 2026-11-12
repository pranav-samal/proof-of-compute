import React from 'react';
import { cn } from '../../lib/utils';
import { AlertCircle } from 'lucide-react';

interface FormFieldProps {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function FormField({ label, htmlFor, error, hint, required, children, className }: FormFieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-sm font-semibold text-brand-900">
        {label}
        {required && <span className="ml-1 text-accent-500">*</span>}
      </label>
      {children}
      {hint && !error && (
        <p className="text-xs text-gray-400">{hint}</p>
      )}
      {error && (
        <p className="flex items-center gap-1 text-xs text-red-600">
          <AlertCircle className="w-3 h-3 flex-shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export function Input({ error, className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        'w-full px-3.5 py-2.5 text-sm border rounded-xl bg-white placeholder-gray-400 text-brand-900',
        'focus:outline-none focus:ring-2 focus:ring-accent-500/20 focus:border-accent-400 transition-all duration-200',
        error
          ? 'border-red-300 focus:ring-red-300/20 focus:border-red-400'
          : 'border-gray-200 hover:border-gray-300',
        className,
      )}
      {...props}
    />
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

export function Select({ error, className, children, ...props }: SelectProps) {
  return (
    <select
      className={cn(
        'w-full px-3.5 py-2.5 text-sm border rounded-xl bg-white text-brand-900 appearance-none cursor-pointer',
        'focus:outline-none focus:ring-2 focus:ring-accent-500/20 focus:border-accent-400 transition-all duration-200',
        'bg-no-repeat',
        error
          ? 'border-red-300 focus:ring-red-300/20 focus:border-red-400'
          : 'border-gray-200 hover:border-gray-300',
        className,
      )}
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b7280' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
        backgroundPosition: 'right 14px center',
        paddingRight: '2.5rem',
      }}
      {...props}
    >
      {children}
    </select>
  );
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export function Textarea({ error, className, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        'w-full px-3.5 py-2.5 text-sm border rounded-xl bg-white placeholder-gray-400 text-brand-900 resize-y min-h-[80px]',
        'focus:outline-none focus:ring-2 focus:ring-accent-500/20 focus:border-accent-400 transition-all duration-200',
        error
          ? 'border-red-300 focus:ring-red-300/20 focus:border-red-400'
          : 'border-gray-200 hover:border-gray-300',
        className,
      )}
      {...props}
    />
  );
}
