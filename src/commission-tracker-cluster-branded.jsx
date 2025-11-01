import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardBody,
  CardHeader,
  Flex,
  Grid,
  GridItem,
  Heading,
  HStack,
  Input,
  SimpleGrid,
  Stat,
  StatLabel,
  StatNumber,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  Text,
  VStack,
  Avatar,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  useColorMode,
  Container,
  Divider,
  Center,
  Image,
  useToast,
  Drawer,
  DrawerBody,
  DrawerOverlay,
  DrawerContent,
  DrawerCloseButton,
  useDisclosure,
  Icon,
  Collapse,
} from '@chakra-ui/react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { FiLogOut, FiRefreshCw, FiMenu, FiHome, FiFileText, FiSettings, FiMoon, FiSun, FiChevronDown, FiSearch } from 'react-icons/fi';

const CommissionTracker = () => {
  const [user, setUser] = useState(null);
  const [currentMonthData, setCurrentMonthData] = useState([]);
  const [previousMonthData, setPreviousMonthData] = useState([]);
  const [customData, setCustomData] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expandMenu, setExpandMenu] = useState({});
  const { colorMode, toggleColorMode } = useColorMode();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const toast = useToast();

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4336';
  const bgColor = colorMode === 'dark' ? 'gray.800' : 'white';
  const textColor = colorMode === 'dark' ? 'white' : 'gray.800';
  const borderColor = colorMode === 'dark' ? 'gray.700' : 'gray.200';

  // Get current and previous month dates
  const getCurrentMonthDates = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
    return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] };
  };

  const getPreviousMonthDates = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    end.setHours(23, 59, 59, 999);
    return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] };
  };

  // Load dashboard data on mount
  useEffect(() => {
    const fetchCommissionsForRange = async (authToken, startDate, endDate) => {
      if (!authToken) return [];
      try {
        const timestamp = Date.now();
        const url = `${API_URL}/api/commissions?start=${startDate}&end=${endDate}&t=${timestamp}`;
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          },
        });
        if (!response.ok) return [];
        const data = await response.json();
        return data.commissions || [];
      } catch (error) {
        return [];
      }
    };

    const fetchInvoicesForRange = async (authToken, startDate, endDate) => {
      if (!authToken) return [];
      try {
        const timestamp = Date.now();
        const url = `${API_URL}/api/invoices?start=${startDate}&end=${endDate}&t=${timestamp}`;
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          },
        });
        if (!response.ok) return [];
        const data = await response.json();
        return data.invoices || [];
      } catch (error) {
        return [];
      }
    };

    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    
    const initializeDashboard = async (token) => {
      setLoading(true);
      const currentMonth = getCurrentMonthDates();
      const previousMonth = getPreviousMonthDates();

      const current = await fetchCommissionsForRange(token, currentMonth.start, currentMonth.end);
      const previous = await fetchCommissionsForRange(token, previousMonth.start, previousMonth.end);
      const invs = await fetchInvoicesForRange(token, currentMonth.start, currentMonth.end);

      setCurrentMonthData(current);
      setPreviousMonthData(previous);
      setInvoices(invs);
      setLoading(false);
    };

    if (urlToken) {
      localStorage.setItem('authToken', urlToken);
      window.history.replaceState({}, document.title, window.location.pathname);
      setUser({ name: 'Sales Rep', email: 'rep@cluster.local', isAdmin: true });
      initializeDashboard(urlToken);
    } else {
      const savedToken = localStorage.getItem('authToken');
      if (savedToken) {
        setUser({ name: 'Sales Rep', email: 'rep@cluster.local', isAdmin: true });
        initializeDashboard(savedToken);
      }
    }
  }, [API_URL]);

  const handleZohoLogin = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/zoho`);
      const data = await response.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to login', status: 'error', duration: 4000, isClosable: true });
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    setUser(null);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    const token = localStorage.getItem('authToken');
    if (token) {
      const currentMonth = getCurrentMonthDates();
      const previousMonth = getPreviousMonthDates();

      const fetchCommissionsForRange = async (authToken, startDate, endDate) => {
        try {
          const timestamp = Date.now();
          const url = `${API_URL}/api/commissions?start=${startDate}&end=${endDate}&t=${timestamp}`;
          const response = await fetch(url, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${authToken}`,
              'Cache-Control': 'no-cache, no-store, must-revalidate',
            },
          });
          if (!response.ok) return [];
          const data = await response.json();
          return data.commissions || [];
        } catch (error) {
          return [];
        }
      };

      const fetchInvoicesForRange = async (authToken, startDate, endDate) => {
        try {
          const timestamp = Date.now();
          const url = `${API_URL}/api/invoices?start=${startDate}&end=${endDate}&t=${timestamp}`;
          const response = await fetch(url, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${authToken}`,
              'Cache-Control': 'no-cache, no-store, must-revalidate',
            },
          });
          if (!response.ok) return [];
          const data = await response.json();
          return data.invoices || [];
        } catch (error) {
          return [];
        }
      };

      const current = await fetchCommissionsForRange(token, currentMonth.start, currentMonth.end);
      const previous = await fetchCommissionsForRange(token, previousMonth.start, previousMonth.end);
      const invs = await fetchInvoicesForRange(token, currentMonth.start, currentMonth.end);

      setCurrentMonthData(current);
      setPreviousMonthData(previous);
      setInvoices(invs);
    }
    setRefreshing(false);
  };

  const handleCustomDateFilter = async () => {
    if (!customStartDate || !customEndDate) {
      toast({ title: 'Error', description: 'Please select both dates', status: 'error', duration: 4000 });
      return;
    }

    setRefreshing(true);
    const token = localStorage.getItem('authToken');
    if (token) {
      try {
        const timestamp = Date.now();
        const url = `${API_URL}/api/commissions?start=${customStartDate}&end=${customEndDate}&t=${timestamp}`;
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          },
        });
        if (response.ok) {
          const data = await response.json();
          setCustomData(data.commissions || []);
          toast({ title: 'Success', description: 'Filter applied', status: 'success', duration: 2000 });
        }
      } catch (error) {
        toast({ title: 'Error', description: 'Failed to fetch data', status: 'error', duration: 4000 });
      }
    }
    setRefreshing(false);
  };

  const formatChartData = (data) => {
    return data.map(rep => ({
      name: rep.repName.length > 15 ? rep.repName.substring(0, 12) + '...' : rep.repName,
      commission: parseFloat(rep.commission.toFixed(2)),
    }));
  };

  const calculateMetrics = (data) => {
    if (!data || data.length === 0) return { total: 0, avg: 0, top: null };
    const total = data.reduce((sum, rep) => sum + rep.commission, 0);
    const avg = (total / data.length).toFixed(2);
    const top = data.reduce((max, rep) => rep.commission > max.commission ? rep : max);
    return { total: total.toFixed(2), avg, top: top.repName };
  };

  if (!user) {
    return (
      <Flex minH="100vh" align="center" justify="center" bg={colorMode === 'dark' ? 'gray.900' : 'gray.50'}>
        <Card maxW="400px" boxShadow="2xl">
          <CardBody>
            <VStack spacing={6} align="center">
              <Image src="/cluster-on-light.svg" alt="Cluster" h="50px" />
              <VStack spacing={2} align="center">
                <Heading size="lg">Commission Tracker</Heading>
                <Text fontSize="sm" color="gray.600">Horizon UI - Powered by Chakra</Text>
                <Badge colorScheme="orange">BETA v0.1.0</Badge>
              </VStack>
              <Button
                w="100%"
                bg="linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
                color="white"
                size="lg"
                onClick={handleZohoLogin}
                isLoading={loading}
              >
                🔗 Login with Zoho
              </Button>
            </VStack>
          </CardBody>
        </Card>
      </Flex>
    );
  }

  const currentMetrics = calculateMetrics(currentMonthData);
  const previousMetrics = calculateMetrics(previousMonthData);
  const customMetrics = calculateMetrics(customData);

  // Sidebar Menu Items
  const menuItems = [
    { label: 'Dashboard', icon: FiHome },
    { label: 'Invoices', icon: FiFileText },
    { label: 'Settings', icon: FiSettings },
  ];

  return (
    <Flex h="100vh" overflow="hidden" bg={colorMode === 'dark' ? 'gray.900' : 'gray.50'}>
      {/* Sidebar */}
      <Box
        as="aside"
        w={{ base: sidebarOpen ? '250px' : '0', md: '250px' }}
        bg={bgColor}
        borderRight="1px"
        borderColor={borderColor}
        h="100vh"
        overflow="hidden"
        transition="width 0.3s ease"
        display={{ base: sidebarOpen ? 'flex' : 'none', md: 'flex' }}
        flexDirection="column"
      >
        {/* Sidebar Header */}
        <Box p={6} borderBottom="1px" borderColor={borderColor}>
          <HStack spacing={3}>
            <Image src="/cluster-on-light.svg" alt="Cluster" h="32px" />
            <VStack spacing={0} align="start">
              <Text fontWeight="700" fontSize="sm" color={textColor}>Cluster</Text>
              <Text fontSize="xs" color="gray.500">Commission</Text>
            </VStack>
          </HStack>
        </Box>

        {/* Menu Items */}
        <VStack as="nav" spacing={2} p={4} flex="1" align="stretch">
          {menuItems.map((item, idx) => (
            <Button
              key={idx}
              w="100%"
              justifyContent="start"
              variant="ghost"
              leftIcon={<Icon as={item.icon} />}
              _hover={{
                bg: 'purple.50',
                _dark: { bg: 'gray.700' },
              }}
            >
              {item.label}
            </Button>
          ))}
        </VStack>

        {/* Logout Button */}
        <Box p={4} borderTop="1px" borderColor={borderColor}>
          <Button
            w="100%"
            colorScheme="red"
            variant="ghost"
            leftIcon={<FiLogOut />}
            justifyContent="start"
            onClick={handleLogout}
          >
            Logout
          </Button>
        </Box>
      </Box>

      {/* Main Content */}
      <Flex direction="column" flex="1" overflow="hidden">
        {/* Navbar */}
        <Box
          bg={bgColor}
          borderBottom="1px"
          borderColor={borderColor}
          px={6}
          py={4}
          boxShadow="sm"
        >
          <Flex justify="space-between" align="center">
            <HStack spacing={4}>
              <Button
                display={{ base: 'flex', md: 'none' }}
                variant="ghost"
                size="lg"
                onClick={() => setSidebarOpen(!sidebarOpen)}
              >
                <FiMenu size={24} />
              </Button>
            </HStack>

            <HStack spacing={6}>
              <Button
                variant="ghost"
                size="lg"
                onClick={toggleColorMode}
              >
                {colorMode === 'light' ? <FiMoon size={20} /> : <FiSun size={20} />}
              </Button>
              <Button
                size="sm"
                colorScheme="blue"
                leftIcon={<FiRefreshCw />}
                onClick={handleRefresh}
                isLoading={refreshing}
              >
                Refresh
              </Button>
              <Menu>
                <MenuButton as={Button} size="sm" variant="ghost" borderRadius="full" p={0}>
                  <Avatar size="sm" name={user.name} />
                </MenuButton>
                <MenuList>
                  <MenuItem icon={<FiLogOut />} onClick={handleLogout}>
                    Logout
                  </MenuItem>
                </MenuList>
              </Menu>
            </HStack>
          </Flex>
        </Box>

        {/* Page Content */}
        <Box flex="1" overflow="auto" p={6}>
          <Container maxW="7xl">
            <VStack spacing={8} align="stretch">
              <Box>
                <Heading size="lg" mb={6}>📊 Commission Dashboard</Heading>

                <Tabs variant="soft-rounded" colorScheme="purple">
                  <TabList mb={8} bg={bgColor} p={2} borderRadius="lg" boxShadow="sm">
                    <Tab>Current Month</Tab>
                    <Tab>Previous Month</Tab>
                    <Tab>Custom Range</Tab>
                    <Tab>Invoices ({invoices.length})</Tab>
                  </TabList>

                  <TabPanels>
                    {/* Current Month Tab */}
                    <TabPanel>
                      <VStack spacing={6} align="stretch">
                        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={6}>
                          <Card>
                            <CardBody>
                              <Stat>
                                <StatLabel fontSize="sm" fontWeight="500">Total Commission</StatLabel>
                                <StatNumber color="orange.500" fontSize="2xl" mt={2}>${currentMetrics.total}</StatNumber>
                              </Stat>
                            </CardBody>
                          </Card>
                          <Card>
                            <CardBody>
                              <Stat>
                                <StatLabel fontSize="sm" fontWeight="500">Average Commission</StatLabel>
                                <StatNumber color="blue.500" fontSize="2xl" mt={2}>${currentMetrics.avg}</StatNumber>
                              </Stat>
                            </CardBody>
                          </Card>
                          <Card>
                            <CardBody>
                              <Stat>
                                <StatLabel fontSize="sm" fontWeight="500">Top Performer</StatLabel>
                                <StatNumber color="green.500" fontSize="md" mt={2}>{currentMetrics.top || 'N/A'}</StatNumber>
                              </Stat>
                            </CardBody>
                          </Card>
                        </SimpleGrid>

                        {currentMonthData.length > 0 && (
                          <Card>
                            <CardBody>
                              <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={formatChartData(currentMonthData)}>
                                  <CartesianGrid strokeDasharray="3 3" stroke={borderColor} />
                                  <XAxis dataKey="name" />
                                  <YAxis />
                                  <Tooltip contentStyle={{ backgroundColor: bgColor, borderColor: borderColor }} />
                                  <Bar dataKey="commission" fill="#667eea" radius={[8, 8, 0, 0]} />
                                </BarChart>
                              </ResponsiveContainer>
                            </CardBody>
                          </Card>
                        )}
                      </VStack>
                    </TabPanel>

                    {/* Previous Month Tab */}
                    <TabPanel>
                      <VStack spacing={6} align="stretch">
                        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={6}>
                          <Card>
                            <CardBody>
                              <Stat>
                                <StatLabel fontSize="sm" fontWeight="500">Total Commission</StatLabel>
                                <StatNumber color="orange.500" fontSize="2xl" mt={2}>${previousMetrics.total}</StatNumber>
                              </Stat>
                            </CardBody>
                          </Card>
                          <Card>
                            <CardBody>
                              <Stat>
                                <StatLabel fontSize="sm" fontWeight="500">Average Commission</StatLabel>
                                <StatNumber color="blue.500" fontSize="2xl" mt={2}>${previousMetrics.avg}</StatNumber>
                              </Stat>
                            </CardBody>
                          </Card>
                          <Card>
                            <CardBody>
                              <Stat>
                                <StatLabel fontSize="sm" fontWeight="500">Top Performer</StatLabel>
                                <StatNumber color="green.500" fontSize="md" mt={2}>{previousMetrics.top || 'N/A'}</StatNumber>
                              </Stat>
                            </CardBody>
                          </Card>
                        </SimpleGrid>

                        {previousMonthData.length > 0 && (
                          <Card>
                            <CardBody>
                              <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={formatChartData(previousMonthData)}>
                                  <CartesianGrid strokeDasharray="3 3" stroke={borderColor} />
                                  <XAxis dataKey="name" />
                                  <YAxis />
                                  <Tooltip contentStyle={{ backgroundColor: bgColor, borderColor: borderColor }} />
                                  <Bar dataKey="commission" fill="#764ba2" radius={[8, 8, 0, 0]} />
                                </BarChart>
                              </ResponsiveContainer>
                            </CardBody>
                          </Card>
                        )}
                      </VStack>
                    </TabPanel>

                    {/* Custom Range Tab */}
                    <TabPanel>
                      <VStack spacing={6} align="stretch">
                        <Card>
                          <CardBody>
                            <VStack spacing={4} align="stretch">
                              <Grid templateColumns={{ base: '1fr', md: 'repeat(2, 1fr)' }} gap={4}>
                                <Box>
                                  <Text fontSize="sm" fontWeight="600" mb={2}>Start Date</Text>
                                  <Input
                                    type="date"
                                    value={customStartDate}
                                    onChange={(e) => setCustomStartDate(e.target.value)}
                                  />
                                </Box>
                                <Box>
                                  <Text fontSize="sm" fontWeight="600" mb={2}>End Date</Text>
                                  <Input
                                    type="date"
                                    value={customEndDate}
                                    onChange={(e) => setCustomEndDate(e.target.value)}
                                  />
                                </Box>
                              </Grid>
                              <HStack spacing={4}>
                                <Button
                                  bg="linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
                                  color="white"
                                  onClick={handleCustomDateFilter}
                                  isLoading={refreshing}
                                >
                                  🔍 Apply Filter
                                </Button>
                                {customData.length > 0 && (
                                  <Button
                                    colorScheme="red"
                                    variant="outline"
                                    onClick={() => {
                                      setCustomData([]);
                                      setCustomStartDate('');
                                      setCustomEndDate('');
                                    }}
                                  >
                                    ✕ Clear
                                  </Button>
                                )}
                              </HStack>
                            </VStack>
                          </CardBody>
                        </Card>

                        {customData.length > 0 && (
                          <>
                            <SimpleGrid columns={{ base: 1, md: 3 }} spacing={6}>
                              <Card>
                                <CardBody>
                                  <Stat>
                                    <StatLabel fontSize="sm" fontWeight="500">Total Commission</StatLabel>
                                    <StatNumber color="orange.500" fontSize="2xl" mt={2}>${customMetrics.total}</StatNumber>
                                  </Stat>
                                </CardBody>
                              </Card>
                              <Card>
                                <CardBody>
                                  <Stat>
                                    <StatLabel fontSize="sm" fontWeight="500">Average Commission</StatLabel>
                                    <StatNumber color="blue.500" fontSize="2xl" mt={2}>${customMetrics.avg}</StatNumber>
                                  </Stat>
                                </CardBody>
                              </Card>
                              <Card>
                                <CardBody>
                                  <Stat>
                                    <StatLabel fontSize="sm" fontWeight="500">Top Performer</StatLabel>
                                    <StatNumber color="green.500" fontSize="md" mt={2}>{customMetrics.top || 'N/A'}</StatNumber>
                                  </Stat>
                                </CardBody>
                              </Card>
                            </SimpleGrid>

                            <Card>
                              <CardBody>
                                <ResponsiveContainer width="100%" height={300}>
                                  <BarChart data={formatChartData(customData)}>
                                    <CartesianGrid strokeDasharray="3 3" stroke={borderColor} />
                                    <XAxis dataKey="name" />
                                    <YAxis />
                                    <Tooltip contentStyle={{ backgroundColor: bgColor, borderColor: borderColor }} />
                                    <Bar dataKey="commission" fill="#06b6d4" radius={[8, 8, 0, 0]} />
                                  </BarChart>
                                </ResponsiveContainer>
                              </CardBody>
                            </Card>
                          </>
                        )}
                      </VStack>
                    </TabPanel>

                    {/* Invoices Tab */}
                    <TabPanel>
                      <Card>
                        <CardBody>
                          {invoices.length === 0 ? (
                            <Center py={12}>
                              <Text color="gray.500">No invoices found for current month</Text>
                            </Center>
                          ) : (
                            <Box overflowX="auto">
                              <Table size="sm" variant="striped">
                                <Thead>
                                  <Tr borderBottom="2px" borderColor={borderColor}>
                                    <Th>Invoice #</Th>
                                    <Th>Salesperson</Th>
                                    <Th>Date</Th>
                                    <Th>Total</Th>
                                    <Th>Commission</Th>
                                    <Th>Status</Th>
                                  </Tr>
                                </Thead>
                                <Tbody>
                                  {invoices.map((invoice, idx) => (
                                    <Tr key={idx} borderBottom="1px" borderColor={borderColor}>
                                      <Td fontWeight="600">{invoice.invoice_number}</Td>
                                      <Td>{invoice.salesperson_name ? (invoice.salesperson_name.length > 25 ? invoice.salesperson_name.substring(0, 25) + '...' : invoice.salesperson_name) : 'Unassigned'}</Td>
                                      <Td>{new Date(invoice.date).toLocaleDateString()}</Td>
                                      <Td>${parseFloat(invoice.total).toFixed(2)}</Td>
                                      <Td color="green.600" fontWeight="600">${parseFloat(invoice.commission).toFixed(2)}</Td>
                                      <Td>
                                        <Badge colorScheme={invoice.status === 'paid' ? 'green' : 'red'} borderRadius="full">
                                          {invoice.status}
                                        </Badge>
                                      </Td>
                                    </Tr>
                                  ))}
                                </Tbody>
                              </Table>
                            </Box>
                          )}
                        </CardBody>
                      </Card>
                    </TabPanel>
                  </TabPanels>
                </Tabs>
              </Box>
            </VStack>
          </Container>
        </Box>
      </Flex>
    </Flex>
  );
};

export default CommissionTracker;
