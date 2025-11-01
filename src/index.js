import React from 'react';
import ReactDOM from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import CommissionTracker from './commission-tracker-cluster-branded';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ChakraProvider>
      <CommissionTracker />
    </ChakraProvider>
  </React.StrictMode>
);
