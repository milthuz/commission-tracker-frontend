import toast from 'react-hot-toast';

type ToastOptions = {
  [key: string]: {
    icon: string;
    style: {
      border: string;
      padding: string;
      color: string;
    };
    iconTheme: {
      primary: string;
      secondary: string;
    };
  };
};

const toastOptions: ToastOptions = {
  success: {
    icon: '✅',
    style: {
      border: '1px solid #10B981',
      padding: '16px',
      color: '#10B981',
    },
    iconTheme: {
      primary: '#10B981',
      secondary: '#FFFAEE',
    },
  },
  error: {
    icon: '❌',
    style: {
      border: '1px solid #EF4444',
      padding: '16px',
      color: '#EF4444',
    },
    iconTheme: {
      primary: '#EF4444',
      secondary: '#FFFAEE',
    },
  },
  warning: {
    icon: '⚠️',
    style: {
      border: '1px solid #F59E0B',
      padding: '16px',
      color: '#F59E0B',
    },
    iconTheme: {
      primary: '#F59E0B',
      secondary: '#FFFAEE',
    },
  },
  info: {
    icon: 'ℹ️',
    style: {
      border: '1px solid #3B82F6',
      padding: '16px',
      color: '#3B82F6',
    },
    iconTheme: {
      primary: '#3B82F6',
      secondary: '#FFFAEE',
    },
  },
};

const statusCodes: { [key: string]: string } = {
  '200': 'success',
  '201': 'success',
  '400': 'error',
  '401': 'error',
  '403': 'error',
  '404': 'error',
  '500': 'error',
};

type FireToastParams = {
  status: number | string;
  message: string;
  code?: string;
};

export const fireToast = ({ status, message, code }: FireToastParams) => {
  const statusString = status.toString();
  const codeString = code?.toString() || '';

  if (codeString && statusString === codeString) {
    const key = statusCodes[statusString] || 'info';
    const option = toastOptions[key];
    
    if (option) {
      toast(message, {
        icon: option.icon,
        style: option.style,
        iconTheme: option.iconTheme,
      });
    } else {
      toast(message);
    }
  } else {
    const key = statusCodes[statusString] || 'info';
    const option = toastOptions[key];
    
    if (option) {
      toast(message, {
        icon: option.icon,
        style: option.style,
        iconTheme: option.iconTheme,
      });
    } else {
      toast(message);
    }
  }
};

export default fireToast;
