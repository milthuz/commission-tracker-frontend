import React from 'react';
import {
  Box,
  useColorMode,
} from '@chakra-ui/react';

export function Card({ children, ...props }) {
  const { colorMode } = useColorMode();

  return (
    <Box
      bg="white"
      _dark={{ bg: 'gray.800' }}
      borderRadius="xl"
      border="1px"
      borderColor="gray.200"
      _dark={{ borderColor: 'gray.700' }}
      boxShadow="0 4px 6px rgba(0, 0, 0, 0.07)"
      _dark={{ boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)' }}
      transition="all 0.3s ease"
      _hover={{
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
        _dark: { boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)' },
      }}
      {...props}
    >
      {children}
    </Box>
  );
}

export default Card;
