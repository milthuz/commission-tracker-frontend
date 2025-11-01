import React from 'react';
import {
  Box,
  VStack,
  HStack,
  Image,
  Text,
  Button,
  useColorMode,
  Divider,
  Collapse,
  Icon,
} from '@chakra-ui/react';
import { FiHome, FiFileText, FiSettings, FiChevronDown, FiLogOut } from 'react-icons/fi';
import { useLocation, useNavigate } from 'react-router-dom';

function Sidebar({ isOpen, setOpen }) {
  const { colorMode } = useColorMode();
  const location = useLocation();
  const navigate = useNavigate();
  const [expandMenu, setExpandMenu] = React.useState({});

  const menuItems = [
    {
      label: 'Dashboard',
      icon: FiHome,
      path: '/dashboard',
      submenu: [
        { label: 'Current Month', path: '/dashboard/current' },
        { label: 'Previous Month', path: '/dashboard/previous' },
        { label: 'Custom Range', path: '/dashboard/custom' },
      ],
    },
    {
      label: 'Invoices',
      icon: FiFileText,
      path: '/invoices',
    },
    {
      label: 'Settings',
      icon: FiSettings,
      path: '/settings',
    },
  ];

  const toggleSubmenu = (key) => {
    setExpandMenu(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const isActive = (path) => location.pathname === path;

  return (
    <Box
      as="aside"
      w={{ base: isOpen ? '250px' : '0', md: '250px' }}
      bg="white"
      _dark={{ bg: 'gray.800' }}
      borderRight="1px"
      borderColor="gray.200"
      _dark={{ borderColor: 'gray.700' }}
      h="100vh"
      overflow="hidden"
      transition="width 0.3s ease"
      display={{ base: isOpen ? 'flex' : 'none', md: 'flex' }}
      flexDirection="column"
    >
      {/* Logo Section */}
      <Box p={6} borderBottom="1px" borderColor="gray.200" _dark={{ borderColor: 'gray.700' }}>
        <HStack spacing={3}>
          <Image src="/cluster-on-light.svg" alt="Cluster" h="32px" />
          <VStack spacing={0} align="start">
            <Text fontWeight="700" fontSize="sm">Cluster</Text>
            <Text fontSize="xs" color="gray.500">Commission</Text>
          </VStack>
        </HStack>
      </Box>

      {/* Menu Items */}
      <VStack as="nav" spacing={2} p={4} flex="1" align="stretch">
        {menuItems.map((item, idx) => (
          <Box key={idx}>
            <Button
              w="100%"
              justifyContent="start"
              variant={isActive(item.path) ? 'solid' : 'ghost'}
              bg={isActive(item.path) ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'transparent'}
              color={isActive(item.path) ? 'white' : 'inherit'}
              leftIcon={<Icon as={item.icon} />}
              onClick={() => {
                if (item.submenu) {
                  toggleSubmenu(idx);
                } else {
                  navigate(item.path);
                }
              }}
              _hover={{
                bg: isActive(item.path) ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'gray.100',
                _dark: { bg: isActive(item.path) ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'gray.700' },
              }}
            >
              <HStack w="100%" justify="space-between">
                <Text>{item.label}</Text>
                {item.submenu && (
                  <Icon
                    as={FiChevronDown}
                    transform={expandMenu[idx] ? 'rotate(180deg)' : 'rotate(0deg)'}
                    transition="transform 0.2s"
                  />
                )}
              </HStack>
            </Button>

            {/* Submenu */}
            {item.submenu && (
              <Collapse in={expandMenu[idx]}>
                <VStack spacing={1} pl={8} mt={2} align="stretch">
                  {item.submenu.map((subitem, subidx) => (
                    <Button
                      key={subidx}
                      w="100%"
                      justifyContent="start"
                      variant={isActive(subitem.path) ? 'solid' : 'ghost'}
                      size="sm"
                      fontSize="sm"
                      bg={isActive(subitem.path) ? 'purple.100' : 'transparent'}
                      color={isActive(subitem.path) ? 'purple.600' : 'gray.600'}
                      onClick={() => navigate(subitem.path)}
                    >
                      {subitem.label}
                    </Button>
                  ))}
                </VStack>
              </Collapse>
            )}
          </Box>
        ))}
      </VStack>

      {/* Footer */}
      <Box p={4} borderTop="1px" borderColor="gray.200" _dark={{ borderColor: 'gray.700' }}>
        <Button
          w="100%"
          colorScheme="red"
          variant="ghost"
          leftIcon={<FiLogOut />}
          justifyContent="start"
        >
          Logout
        </Button>
      </Box>
    </Box>
  );
}

export default Sidebar;
