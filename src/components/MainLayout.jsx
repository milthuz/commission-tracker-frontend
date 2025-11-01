import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';

export function MainLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = React.useState(true);

  return (
    <Flex h="100vh" overflow="hidden">
      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} setOpen={setSidebarOpen} />

      {/* Main Content */}
      <Flex direction="column" flex="1" overflow="hidden">
        {/* Navbar */}
        <Navbar onMenuClick={() => setSidebarOpen(!sidebarOpen)} />

        {/* Page Content */}
        <Box flex="1" overflow="auto" bg="gray.50" _dark={{ bg: 'gray.900' }}>
          {children}
        </Box>
      </Flex>
    </Flex>
  );
}

export default MainLayout;
