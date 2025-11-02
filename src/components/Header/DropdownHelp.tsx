import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';

interface DropdownHelpProps {
  sidebarOpen: string | boolean | undefined;
}

const DropdownHelp: React.FC<DropdownHelpProps> = () => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const dropdown = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const clickHandler = ({ target }: MouseEvent) => {
      if (!dropdown.current) return;
      if (
        !dropdownOpen ||
        dropdown.current.contains(target as Node) ||
        trigger.current?.contains(target as Node)
      )
        return;
      setDropdownOpen(false);
    };
    document.addEventListener('click', clickHandler);
    return () => document.removeEventListener('click', clickHandler);
  });

  // Close on ESC
  useEffect(() => {
    const keyHandler = ({ keyCode }: KeyboardEvent) => {
      if (!dropdownOpen || keyCode !== 27) return;
      setDropdownOpen(false);
    };
    document.addEventListener('keydown', keyHandler);
    return () => document.removeEventListener('keydown', keyHandler);
  });

  return (
    <div className="relative">
      <button
        ref={trigger}
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="relative flex items-center justify-center h-8.5 w-8.5 rounded-full border border-stroke bg-gray hover:text-primary dark:border-strokedark dark:bg-meta-4 dark:text-white"
        title="Help & Settings"
      >
        <svg
          className="fill-current duration-300 ease-in-out"
          height="18"
          width="18"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M19.14,12.94c.04,-0.3 .06,-0.61 .06,-0.94c0,-0.32 -0.02,-0.64 -0.07,-0.94l2.03,-1.58c.18,-0.14 .23,-0.41 .12,-0.64l-1.92,-3.32c-.12,-0.22 -0.37,-0.29 -0.59,-0.22l-2.39,.96c-.5,-0.38 -1.03,-0.7 -1.62,-0.94l-.36,-2.54c-.04,-0.24 -0.24,-0.41 -0.48,-0.41h-3.84c-.24,0 -0.43,.17 -0.47,.41l-.36,2.54c-.59,.24 -1.13,.57 -1.62,.94l-2.39,-0.96c-.22,-0.08 -0.47,0 -0.59,.22l-1.92,3.32c-.13,.23 -0.07,.5 .12,.64l2.03,1.58c-.05,.3 -0.09,.63 -0.09,.94s.02,.64 .07,.94l-2.03,1.58c-.18,.14 -0.23,.41 -0.12,.64l1.92,3.32c.12,.22 .37,.29 .59,.22l2.39,-0.96c.5,.38 1.03,.7 1.62,.94l.36,2.54c.05,.24 .24,.41 .48,.41h3.84c.24,0 .44,-0.17 .47,-0.41l.36,-2.54c.59,-0.24 1.13,-0.56 1.62,-0.94l2.39,.96c.22,.08 .47,0 .59,-0.22l1.92,-3.32c.12,-0.22 .07,-0.5 -0.12,-0.64l-2.03,-1.58zM12,15.6c-1.98,0 -3.6,-1.62 -3.6,-3.6s1.62,-3.6 3.6,-3.6s3.6,1.62 3.6,3.6s-1.62,3.6 -3.6,3.6z"
            fill="currentColor"
          />
        </svg>
      </button>

      {/* Dropdown menu */}
      <div
        ref={dropdown}
        onFocus={() => setDropdownOpen(true)}
        onBlur={() => setDropdownOpen(false)}
        className={`absolute -right-16 mt-2 flex h-auto w-48 flex-col rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark sm:right-0 sm:w-56 ${
          dropdownOpen === true ? 'block' : 'hidden'
        }`}
      >
        <div className="px-4.5 py-3">
          <h5 className="text-sm font-medium text-bodydark2">Help & Settings</h5>
        </div>

        <ul className="flex flex-col overflow-y-auto">
          <li>
            <Link
              to="/versions"
              className="flex gap-3.5 border-t border-stroke px-4.5 py-3 hover:bg-gray-2 dark:border-strokedark dark:hover:bg-meta-4"
              onClick={() => setDropdownOpen(false)}
            >
              <svg
                className="fill-current"
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M2 2H14C14.55 2 15 2.45 15 3V13C15 13.55 14.55 14 14 14H2C1.45 14 1 13.55 1 13V3C1 2.45 1.45 2 2 2Z"
                  fill=""
                />
                <path d="M2 2V1M14 2V1M2 14V15M14 14V15" stroke="" strokeWidth="1" />
              </svg>
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium text-black dark:text-white">Version History</p>
                <p className="text-xs">See what's new in each release</p>
              </div>
            </Link>
          </li>

          <li>
            <a
              href="https://github.com/milthuz/commission-tracker-frontend"
              target="_blank"
              rel="noopener noreferrer"
              className="flex gap-3.5 border-t border-stroke px-4.5 py-3 hover:bg-gray-2 dark:border-strokedark dark:hover:bg-meta-4"
              onClick={() => setDropdownOpen(false)}
            >
              <svg
                className="fill-current"
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M8 0C3.58 0 0 3.58 0 8C0 11.54 2.29 14.53 5.47 15.59C5.87 15.66 6.02 15.38 6.02 15.13C6.02 14.91 6.01 14.39 6.01 13.72C4 14.09 3.48 13.23 3.32 12.78C3.23 12.55 2.84 11.84 2.5 11.63C2.22 11.46 1.82 11.09 2.49 11.08C3.12 11.07 3.57 11.69 3.72 11.97C4.44 13.15 5.59 12.81 6.05 12.56C6.12 12.05 6.33 11.73 6.56 11.53C4.78 11.33 2.92 10.64 2.92 7.58C2.92 6.71 3.23 5.99 3.74 5.43C3.66 5.23 3.38 4.41 3.82 3.31C3.82 3.31 4.49 3.05 6.02 4.09C6.66 3.93 7.33 3.85 8 3.85C8.67 3.85 9.34 3.94 9.98 4.09C11.51 3.04 12.18 3.31 12.18 3.31C12.62 4.41 12.34 5.23 12.26 5.43C12.77 5.99 13.08 6.71 13.08 7.58C13.08 10.65 11.21 11.33 9.43 11.53C9.72 11.78 9.97 12.26 9.97 13.03C9.97 14.08 9.96 14.93 9.96 15.13C9.96 15.38 10.11 15.67 10.51 15.59C13.71 14.53 16 11.53 16 8C16 3.58 12.42 0 8 0Z"
                  fill=""
                />
              </svg>
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium text-black dark:text-white">Github</p>
                <p className="text-xs">View on GitHub</p>
              </div>
            </a>
          </li>

          <li>
            <a
              href="mailto:support@cluster.com"
              className="flex gap-3.5 border-t border-stroke px-4.5 py-3 hover:bg-gray-2 dark:border-strokedark dark:hover:bg-meta-4"
              onClick={() => setDropdownOpen(false)}
            >
              <svg
                className="fill-current"
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M2 2H14C14.55 2 15 2.45 15 3V13C15 13.55 14.55 14 14 14H2C1.45 14 1 13.55 1 13V3C1 2.45 1.45 2 2 2Z"
                  fill=""
                />
                <path
                  d="M14 3.5L8 8.5L2 3.5V3H14V3.5Z"
                  fill="white"
                />
              </svg>
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium text-black dark:text-white">Support</p>
                <p className="text-xs">Contact us for help</p>
              </div>
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
};

export default DropdownHelp;
