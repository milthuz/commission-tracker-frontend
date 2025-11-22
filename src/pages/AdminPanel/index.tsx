import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL;

interface Salesperson {
  name: string;
  isActive: boolean;
  invoiceCount: number;
}

const AdminPanel = () => {
  useAuth();
  const navigate = useNavigate();
  const [salespeople, setSalespeople] = useState<Salesperson[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Check if user is admin
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const adminStatus = payload.isAdmin || false;
        setIsAdmin(adminStatus);
        
        if (!adminStatus) {
          // Not admin, redirect to dashboard
          navigate('/');
        }
      } catch (error) {
        console.error('Error decoding token:', error);
        navigate('/');
      }
    }
  }, [navigate]);

  // Fetch all salespeople
  const fetchSalespeople = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      const response = await axios.get(`${API_URL}/api/salespeople/all`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setSalespeople(response.data.salespeople || []);
    } catch (error) {
      console.error('Error fetching salespeople:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchSalespeople();
    }
  }, [isAdmin]);

  // Toggle salesperson active status
  const toggleSalesperson = async (name: string, currentStatus: boolean) => {
    try {
      const token = localStorage.getItem('token');
      
      await axios.put(
        `${API_URL}/api/salespeople/${encodeURIComponent(name)}/status`,
        { isActive: !currentStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Update local state
      setSalespeople(prev =>
        prev.map(person =>
          person.name === name
            ? { ...person, isActive: !currentStatus }
            : person
        )
      );
    } catch (error) {
      console.error('Error updating salesperson status:', error);
      alert('Failed to update salesperson status');
    }
  };

  // Filter salespeople by search
  const filteredSalespeople = salespeople.filter(person =>
    person.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const activePeople = filteredSalespeople.filter(p => p.isActive);
  const inactivePeople = filteredSalespeople.filter(p => !p.isActive);

  if (!isAdmin) {
    return null; // Will redirect via useEffect
  }

  return (
    <div>
      {/* Page Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-title-md2 font-semibold text-black dark:text-white">
            Admin Panel
          </h2>
          <p className="text-sm text-body">Manage salespeople and system settings</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6 xl:grid-cols-3 2xl:gap-7.5">
        <div className="rounded-sm border border-stroke bg-white px-7.5 py-6 shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="flex h-11.5 w-11.5 items-center justify-center rounded-full bg-meta-2 dark:bg-meta-4">
            <svg className="fill-primary dark:fill-white" width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M11 0C4.92487 0 0 4.92487 0 11C0 17.0751 4.92487 22 11 22C17.0751 22 22 17.0751 22 11C22 4.92487 17.0751 0 11 0ZM11 5C12.6569 5 14 6.34315 14 8C14 9.65685 12.6569 11 11 11C9.34315 11 8 9.65685 8 8C8 6.34315 9.34315 5 11 5ZM11 19C8.33 19 5.98 17.47 4.79 15.19C4.82 12.87 9.5 11.59 11 11.59C12.49 11.59 17.17 12.87 17.21 15.19C16.02 17.47 13.67 19 11 19Z" />
            </svg>
          </div>
          <div className="mt-4 flex items-end justify-between">
            <div>
              <h4 className="text-title-md font-bold text-black dark:text-white">
                {salespeople.length}
              </h4>
              <span className="text-sm font-medium">Total Salespeople</span>
            </div>
          </div>
        </div>

        <div className="rounded-sm border border-stroke bg-white px-7.5 py-6 shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="flex h-11.5 w-11.5 items-center justify-center rounded-full bg-meta-3 dark:bg-meta-4">
            <svg className="fill-primary dark:fill-white" width="22" height="16" viewBox="0 0 22 16" fill="none">
              <path d="M11 15.1156C4.19376 15.1156 0.825012 8.61876 0.687512 8.34376C0.584387 8.13751 0.584387 7.86251 0.687512 7.65626C0.825012 7.38126 4.19376 0.918762 11 0.918762C17.8063 0.918762 21.175 7.38126 21.3125 7.65626C21.4156 7.86251 21.4156 8.13751 21.3125 8.34376C21.175 8.61876 17.8063 15.1156 11 15.1156ZM2.26876 8.00001C3.02501 9.27189 5.98126 13.5688 11 13.5688C16.0188 13.5688 18.975 9.27189 19.7313 8.00001C18.975 6.72814 16.0188 2.43126 11 2.43126C5.98126 2.43126 3.02501 6.72814 2.26876 8.00001Z" />
              <path d="M11 10.9219C9.38438 10.9219 8.07812 9.61562 8.07812 8C8.07812 6.38438 9.38438 5.07812 11 5.07812C12.6156 5.07812 13.9219 6.38438 13.9219 8C13.9219 9.61562 12.6156 10.9219 11 10.9219ZM11 6.625C10.2437 6.625 9.625 7.24375 9.625 8C9.625 8.75625 10.2437 9.375 11 9.375C11.7563 9.375 12.375 8.75625 12.375 8C12.375 7.24375 11.7563 6.625 11 6.625Z" />
            </svg>
          </div>
          <div className="mt-4 flex items-end justify-between">
            <div>
              <h4 className="text-title-md font-bold text-black dark:text-white">
                {activePeople.length}
              </h4>
              <span className="text-sm font-medium">Active Salespeople</span>
            </div>
          </div>
        </div>

        <div className="rounded-sm border border-stroke bg-white px-7.5 py-6 shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="flex h-11.5 w-11.5 items-center justify-center rounded-full bg-meta-1 dark:bg-meta-4">
            <svg className="fill-primary dark:fill-white" width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M11 0.6875C5.19375 0.6875 0.4375 5.40938 0.4375 11.25C0.4375 17.0906 5.19375 21.8125 11 21.8125C16.8406 21.8125 21.5625 17.0906 21.5625 11.25C21.5625 5.40938 16.8406 0.6875 11 0.6875ZM15.125 14.5438C15.2625 14.6813 15.2625 14.9219 15.125 15.0594L14.0531 16.1313C13.9844 16.2 13.8813 16.2344 13.7781 16.2344C13.675 16.2344 13.5719 16.2 13.5031 16.1313L11 13.6281L8.46563 16.1625C8.39688 16.2313 8.29375 16.2656 8.19063 16.2656C8.0875 16.2656 7.98438 16.2313 7.91563 16.1625L6.84375 15.0906C6.70625 14.9531 6.70625 14.7125 6.84375 14.575L9.34688 12.0406L6.8125 9.50625C6.675 9.36875 6.675 9.12812 6.8125 8.99063L7.88438 7.91875C8.02188 7.78125 8.2625 7.78125 8.4 7.91875L10.9344 10.4531L13.4688 7.91875C13.6063 7.78125 13.8469 7.78125 13.9844 7.91875L15.0563 8.99063C15.1938 9.12812 15.1938 9.36875 15.0563 9.50625L12.5219 12.0406L15.125 14.5438Z" />
            </svg>
          </div>
          <div className="mt-4 flex items-end justify-between">
            <div>
              <h4 className="text-title-md font-bold text-black dark:text-white">
                {inactivePeople.length}
              </h4>
              <span className="text-sm font-medium">Inactive</span>
            </div>
          </div>
        </div>
      </div>

      {/* Salespeople Management */}
      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="border-b border-stroke px-7 py-4 dark:border-strokedark">
          <h3 className="font-medium text-black dark:text-white">
            Manage Salespeople
          </h3>
          <p className="text-sm text-body mt-1">
            Toggle salespeople on/off to control who appears in the invoice filters
          </p>
        </div>

        {/* Search Bar */}
        <div className="px-7 py-4 border-b border-stroke dark:border-strokedark">
          <input
            type="text"
            placeholder="Search salespeople..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded border-[1.5px] border-stroke bg-transparent px-5 py-3 font-medium outline-none transition focus:border-primary active:border-primary disabled:cursor-default disabled:bg-whiter dark:border-form-strokedark dark:bg-form-input dark:focus:border-primary"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-solid border-primary border-t-transparent"></div>
          </div>
        ) : (
          <div className="p-7">
            <div className="max-h-[600px] overflow-y-auto">
              <table className="w-full table-auto">
                <thead>
                  <tr className="bg-gray-2 text-left dark:bg-meta-4">
                    <th className="px-4 py-4 font-medium text-black dark:text-white">
                      Name
                    </th>
                    <th className="px-4 py-4 font-medium text-black dark:text-white">
                      Invoices
                    </th>
                    <th className="px-4 py-4 font-medium text-black dark:text-white">
                      Status
                    </th>
                    <th className="px-4 py-4 font-medium text-black dark:text-white">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSalespeople.map((person) => (
                    <tr key={person.name} className="border-b border-stroke dark:border-strokedark">
                      <td className="px-4 py-5">
                        <p className="text-black dark:text-white">{person.name}</p>
                      </td>
                      <td className="px-4 py-5">
                        <p className="text-body">{person.invoiceCount} invoices</p>
                      </td>
                      <td className="px-4 py-5">
                        {person.isActive ? (
                          <span className="inline-flex rounded-full bg-success bg-opacity-10 px-3 py-1 text-sm font-medium text-success">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-danger bg-opacity-10 px-3 py-1 text-sm font-medium text-danger">
                            Inactive
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-5">
                        <button
                          onClick={() => toggleSalesperson(person.name, person.isActive)}
                          className={`inline-flex items-center justify-center rounded-md px-4 py-2 text-center text-sm font-medium transition ${
                            person.isActive
                              ? 'bg-danger text-white hover:bg-opacity-90'
                              : 'bg-success text-white hover:bg-opacity-90'
                          }`}
                        >
                          {person.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filteredSalespeople.length === 0 && (
                <div className="py-12 text-center">
                  <p className="text-body">No salespeople found</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;
