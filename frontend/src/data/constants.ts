export const WORKLOAD_TYPES = [
  { value: 'inference', label: 'Inference', description: 'Run a trained model to generate predictions or outputs.' },
  { value: 'training', label: 'Model Training', description: 'Train or fine-tune a machine learning model on a dataset.' },
  { value: 'image-processing', label: 'Image Processing', description: 'Batch image generation, transformation, or analysis tasks.' },
  { value: 'general-compute', label: 'General Compute', description: 'Any CUDA/GPU-accelerated computation not covered above.' },
] as const;

export const VERIFICATION_OPTIONS = [
  {
    value: 'none',
    label: 'No Verification',
    description: 'Trust the provider\'s output. Fastest and cheapest.',
  },
  {
    value: 'hash-check',
    label: 'Output Hash',
    description: 'Record a SHA-256 hash of the output for tamper detection.',
  },
  {
    value: 'zkp',
    label: 'Zero-Knowledge Proof',
    description: 'Cryptographic proof of correct execution. Highest assurance, higher cost.',
  },
  {
    value: 'tee',
    label: 'Trusted Execution Environment',
    description: 'Execution inside a hardware-secured enclave (e.g. Intel SGX).',
  },
] as const;

export const VRAM_OPTIONS = [0, 8, 16, 24, 40, 48, 80];
export const RAM_OPTIONS = [16, 32, 64, 128, 192, 256, 512];
export const MAX_PRICE_OPTIONS = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 10];

export const STATUS_COLORS: Record<string, string> = {
  available: 'bg-emerald-50  text-emerald-700 ring-1 ring-emerald-200',
  busy: 'bg-amber-50    text-amber-700   ring-1 ring-amber-200',
  offline: 'bg-gray-100    text-gray-500    ring-1 ring-gray-200',
  REGISTERED: 'bg-indigo-50   text-indigo-700  ring-1 ring-indigo-200',
  ASSIGNED: 'bg-blue-50     text-blue-700    ring-1 ring-blue-200',
  COMMITTED: 'bg-purple-50   text-purple-700  ring-1 ring-purple-200',
  VERIFYING: 'bg-amber-50    text-amber-700   ring-1 ring-amber-200',
  SETTLED: 'bg-emerald-50  text-emerald-700 ring-1 ring-emerald-200',
  DISPUTED: 'bg-red-50      text-red-700     ring-1 ring-red-200',
  REFUNDED: 'bg-gray-100    text-gray-600    ring-1 ring-gray-200',
};

export const STATUS_LABELS: Record<string, string> = {
  available: 'Available',
  busy: 'Busy',
  offline: 'Offline',
  REGISTERED: 'Registered',
  ASSIGNED: 'Assigned',
  COMMITTED: 'Committed',
  VERIFYING: 'Verifying',
  SETTLED: 'Settled',
  DISPUTED: 'Disputed',
  REFUNDED: 'Refunded',
};

export const WORKLOAD_LABELS: Record<string, string> = {
  'inference': 'Inference',
  'training': 'Model Training',
  'image-processing': 'Image Processing',
  'general-compute': 'General Compute',
};

export const VERIFICATION_LABELS: Record<string, string> = {
  'none': 'No Verification',
  'hash-check': 'Output Hash',
  'zkp': 'Zero-Knowledge Proof',
  'tee': 'Trusted Execution Env.',
};

export const NAV_ITEMS = [
  { path: '/', label: 'Home', icon: 'Home' },
  { path: '/marketplace', label: 'Marketplace', icon: 'LayoutGrid' },
  { path: '/submit-job', label: 'Submit Job', icon: 'Send' },
  { path: '/dashboard', label: 'My Dashboard', icon: 'BarChart3' },
  { path: '/jobs', label: 'Job Details', icon: 'ClipboardList' },
  { path: '/provider', label: 'Provider Console', icon: 'Server' },
  { path: '/verification', label: 'Verification', icon: 'ShieldCheck' },
] as const;
