import React from 'react';
import {
  Box,
  Button,
  Flex,
  HStack,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Avatar,
  Text,
  useColorMode,
  Input,
  InputGroup,
  InputLeftElement,
  Icon,
} from '@chakra-ui/react';
import { FiMenu, FiSearch, FiMoon, FiSun, FiLogOut, FiSettings } from 'react-icons/fi';

function Navbar({ onMenuClick }) {
  const { colorMode, toggleColorMode } = useColorMode();

  return (
    <Box
      bg="white"
      _dark={{ bg: 'gray.800' }}
      borderBottom="1px"
      borderColor="gray.200"
      _dark={{ borderColor: 'gray.700' }}
      px={6}
      py={4}
      boxShadow="sm"
    >
      <Flex justify="space-between" align="center">
        {/* Left Side */}
        <HStack spacing={4}>
          <Button
            display={{ base: 'flex', md: 'none' }}
            variant="ghost"
            size="lg"
            onClick={onMenuClick}
          >
            <FiMenu size={24} />
          </Button>

          {/* Search Bar */}
          <InputGroup maxW="300px" display={{ base: 'none', md: 'flex' }}>
            <InputLeftElement pointerEvents="none">
              <Icon as={FiSearch} color="gray.400" />
            </InputLeftElement>
            <Input
              type="text"
              placeholder="Search..."
              borderColor="gray.300"
              _dark={{ borderColor: 'gray.600' }}
            />
          </InputGroup>
        </HStack>

        {/* Right Side */}
        <HStack spacing={6}>
          {/* Theme Toggle */}
          <Button
            variant="ghost"
            size="lg"
            onClick={toggleColorMode}
            title={`Switch to ${colorMode === 'light' ? 'dark' : 'light'} mode`}
          >
            {colorMode === 'light' ? <FiMoon size={20} /> : <FiSun size={20} />}
          </Button>

          {/* User Menu */}
          <Menu>
            <MenuButton as={Button} variant="ghost" size="lg" borderRadius="full" p={0}>
              <Avatar size="sm" name="Sales Rep" />
            </MenuButton>
            <MenuList>
              <MenuItem icon={<FiSettings />}>Settings</MenuItem>
              <MenuItem icon={<FiLogOut />}>Logout</MenuItem>
            </MenuList>
          </Menu>
        </HStack>
      </Flex>
    </Box>
  );
}

export default Navbar;
