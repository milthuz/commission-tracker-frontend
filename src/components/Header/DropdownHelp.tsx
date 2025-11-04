import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

const DropdownHelp = () => {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const trigger = useRef<any>(null);
  const dropdown = useRef<any>(null);

  // close on click outside
  useEffect(() => {
    const clickHandler = ({ target }: MouseEvent) => {
      if (!dropdown.current) return;
      if (
        !dropdownOpen ||
        dropdown.current.contains(target) ||
        trigger.current.contains(target)
      )
        return;
      setDropdownOpen(false);
    };
    document.addEventListener('click', clickHandler);
    return () => document.removeEventListener('click', clickHandler);
  });

  // close if the esc key is pressed
  useEffect(() => {
    const keyHandler = ({ keyCode }: KeyboardEvent) => {
      if (!dropdownOpen || keyCode !== 27) return;
      setDropdownOpen(false);
    };
    document.addEventListener('keydown', keyHandler);
    return () => document.removeEventListener('keydown', keyHandler);
  });

  return (
    <li className="relative">
      <Link
        ref={trigger}
        onClick={() => setDropdownOpen(!dropdownOpen)}
        to="#"
        className="relative flex h-8.5 w-8.5 items-center justify-center rounded-full border-[0.5px] border-stroke bg-gray hover:text-primary dark:border-strokedark dark:bg-meta-4 dark:text-white"
      >
        <svg
          className="fill-current"
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M16.1999 9.30001H15.5999C15.3999 9.30001 15.2999 9.10001 15.2999 8.90001C15.2999 8.70001 15.2999 8.50001 15.2999 8.30001C15.2999 8.10001 15.3999 7.90001 15.5999 7.90001H16.1999C16.5999 7.90001 16.9999 7.50001 16.9999 7.10001V6.50001C16.9999 6.10001 16.5999 5.70001 16.1999 5.70001H15.5999C15.3999 5.70001 15.2999 5.50001 15.2999 5.30001C15.2999 5.10001 15.2999 4.90001 15.2999 4.70001C15.2999 4.50001 15.3999 4.30001 15.5999 4.30001H16.1999C16.5999 4.30001 16.9999 3.90001 16.9999 3.50001V2.90001C16.9999 2.50001 16.5999 2.10001 16.1999 2.10001H15.5999C15.3999 2.10001 15.2999 1.90001 15.2999 1.70001C15.2999 1.50001 15.0999 1.30001 14.8999 1.30001H14.2999C13.8999 1.30001 13.4999 1.70001 13.4999 2.10001V2.70001C13.4999 2.90001 13.2999 3.00001 13.0999 3.00001C12.8999 3.00001 12.6999 3.00001 12.4999 3.00001C12.2999 3.00001 12.0999 2.90001 12.0999 2.70001V2.10001C12.0999 1.70001 11.6999 1.30001 11.2999 1.30001H10.6999C10.2999 1.30001 9.89991 1.70001 9.89991 2.10001V2.70001C9.89991 2.90001 9.69991 3.00001 9.49991 3.00001C9.29991 3.00001 9.09991 3.00001 8.89991 3.00001C8.69991 3.00001 8.49991 2.90001 8.49991 2.70001V2.10001C8.49991 1.70001 8.09991 1.30001 7.69991 1.30001H7.09991C6.69991 1.30001 6.29991 1.70001 6.29991 2.10001V2.70001C6.29991 2.90001 6.09991 3.00001 5.89991 3.00001C5.69991 3.00001 5.49991 3.00001 5.29991 3.00001C5.09991 3.00001 4.89991 2.90001 4.89991 2.70001V2.10001C4.89991 1.70001 4.49991 1.30001 4.09991 1.30001H3.49991C3.09991 1.30001 2.69991 1.70001 2.69991 2.10001V2.70001C2.69991 2.90001 2.49991 3.00001 2.29991 3.00001H1.69991C1.29991 3.00001 0.899902 3.40001 0.899902 3.80001V4.40001C0.899902 4.80001 1.29991 5.20001 1.69991 5.20001H2.29991C2.49991 5.20001 2.59991 5.40001 2.59991 5.60001C2.59991 5.80001 2.59991 6.00001 2.59991 6.20001C2.59991 6.40001 2.49991 6.60001 2.29991 6.60001H1.69991C1.29991 6.60001 0.899902 7.00001 0.899902 7.40001V8.00001C0.899902 8.40001 1.29991 8.80001 1.69991 8.80001H2.29991C2.49991 8.80001 2.59991 9.00001 2.59991 9.20001C2.59991 9.40001 2.59991 9.60001 2.59991 9.80001C2.59991 10 2.49991 10.2 2.29991 10.2H1.69991C1.29991 10.2 0.899902 10.6 0.899902 11V11.6C0.899902 12 1.29991 12.4 1.69991 12.4H2.29991C2.49991 12.4 2.59991 12.6 2.59991 12.8C2.59991 13 2.79991 13.2 2.99991 13.2H3.59991C3.99991 13.2 4.39991 12.8 4.39991 12.4V11.8C4.39991 11.6 4.59991 11.5 4.79991 11.5C4.99991 11.5 5.19991 11.5 5.39991 11.5C5.59991 11.5 5.79991 11.6 5.79991 11.8V12.4C5.79991 12.8 6.19991 13.2 6.59991 13.2H7.19991C7.59991 13.2 7.99991 12.8 7.99991 12.4V11.8C7.99991 11.6 8.19991 11.5 8.39991 11.5C8.59991 11.5 8.79991 11.5 8.99991 11.5C9.19991 11.5 9.39991 11.6 9.39991 11.8V12.4C9.39991 12.8 9.79991 13.2 10.1999 13.2H10.7999C11.1999 13.2 11.5999 12.8 11.5999 12.4V11.8C11.5999 11.6 11.7999 11.5 11.9999 11.5C12.1999 11.5 12.3999 11.5 12.5999 11.5C12.7999 11.5 12.9999 11.6 12.9999 11.8V12.4C12.9999 12.8 13.3999 13.2 13.7999 13.2H14.3999C14.7999 13.2 15.1999 12.8 15.1999 12.4V11.8C15.1999 11.6 15.3999 11.5 15.5999 11.5H16.1999C16.5999 11.5 16.9999 11.1 16.9999 10.7V10.1C16.9999 9.70001 16.5999 9.30001 16.1999 9.30001Z"
            fill=""
          />
          <path
            d="M9.00039 5.89941C7.10039 5.89941 5.60039 7.39941 5.60039 9.29941C5.60039 11.1994 7.10039 12.6994 9.00039 12.6994C10.9004 12.6994 12.4004 11.1994 12.4004 9.29941C12.4004 7.39941 10.9004 5.89941 9.00039 5.89941Z"
            fill=""
          />
        </svg>
      </Link>

      <div
        ref={dropdown}
        onFocus={() => setDropdownOpen(true)}
        onBlur={() => setDropdownOpen(false)}
        className={`absolute -right-16 mt-2.5 flex w-75 flex-col rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark sm:right-0 sm:w-80 ${
          dropdownOpen === true ? 'block' : 'hidden'
        }`}
      >
        <div className="px-4.5 py-3">
          <h5 className="text-sm font-medium text-bodydark2">Help & Info</h5>
        </div>

        <ul className="flex h-auto flex-col overflow-y-auto">
          <li>
            <Link
              className="flex gap-4.5 border-t border-stroke px-4.5 py-3 hover:bg-gray-2 dark:border-strokedark dark:hover:bg-meta-4"
              to="/versions"
              onClick={() => setDropdownOpen(false)}
            >
              <div className="flex h-11.5 w-11.5 items-center justify-center rounded-full bg-primary">
                <svg
                  className="fill-white"
                  width="18"
                  height="18"
                  viewBox="0 0 18 18"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M15.7499 2.9812H14.2874V2.36245C14.2874 2.02495 14.0062 1.71558 13.6405 1.71558C13.2749 1.71558 12.9937 1.99683 12.9937 2.36245V2.9812H4.97803V2.36245C4.97803 2.02495 4.69678 1.71558 4.33115 1.71558C3.96553 1.71558 3.68428 1.99683 3.68428 2.36245V2.9812H2.2499C1.29365 2.9812 0.478027 3.7687 0.478027 4.75308V14.5406C0.478027 15.4968 1.26553 16.3125 2.2499 16.3125H15.7499C16.7062 16.3125 17.5218 15.525 17.5218 14.5406V4.72495C17.5218 3.7687 16.7062 2.9812 15.7499 2.9812ZM1.77178 8.21245H4.1624V10.9968H1.77178V8.21245ZM5.42803 8.21245H8.38115V10.9968H5.42803V8.21245ZM8.38115 12.2625V15.0187H5.42803V12.2625H8.38115ZM9.64678 12.2625H12.5999V15.0187H9.64678V12.2625ZM9.64678 10.9968V8.21245H12.5999V10.9968H9.64678ZM13.8374 8.21245H16.228V10.9968H13.8374V8.21245ZM2.2499 4.24683H3.7124V4.83745C3.7124 5.17495 3.99365 5.48433 4.35928 5.48433C4.7249 5.48433 5.00615 5.20308 5.00615 4.83745V4.24683H13.0499V4.83745C13.0499 5.17495 13.3312 5.48433 13.6968 5.48433C14.0624 5.48433 14.3437 5.20308 14.3437 4.83745V4.24683H15.7499C16.0312 4.24683 16.2562 4.47183 16.2562 4.75308V6.94683H1.77178V4.75308C1.77178 4.47183 1.96865 4.24683 2.2499 4.24683ZM1.77178 14.5125V12.2343H4.1624V14.9906H2.2499C1.96865 15.0187 1.77178 14.7937 1.77178 14.5125ZM15.7499 15.0187H13.8374V12.2625H16.228V14.5406C16.2562 14.7937 16.0312 15.0187 15.7499 15.0187Z"
                    fill=""
                  />
                </svg>
              </div>
              <div className="flex flex-1 flex-col">
                <span className="font-medium text-black dark:text-white">
                  Version History
                </span>
                <span className="text-sm">View release notes and updates</span>
              </div>
            </Link>
          </li>

          <li>
            <a
              className="flex gap-4.5 border-t border-stroke px-4.5 py-3 hover:bg-gray-2 dark:border-strokedark dark:hover:bg-meta-4"
              href="mailto:david@clustersystems.com?subject=Commission Tracker Support Request"
            >
              <div className="flex h-11.5 w-11.5 items-center justify-center rounded-full bg-meta-6">
                <svg
                  className="fill-white"
                  width="18"
                  height="18"
                  viewBox="0 0 18 18"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M16.1999 14.95L15.6749 14.05C15.5249 13.7875 15.2999 13.6 14.9999 13.525L13.3499 13.1C12.9749 13.0125 12.5249 13.1375 12.2999 13.4L11.5499 14.2C9.2999 13.1875 7.37494 11.2625 6.3374 9.00004L7.1374 8.25004C7.3874 8.02504 7.5374 7.57504 7.4499 7.20004L7.02494 5.55004C6.94994 5.25004 6.73744 5.02504 6.5124 4.87504L5.6124 4.35004C5.3874 4.20004 5.0874 4.12504 4.8124 4.15004C4.5374 4.17504 4.2874 4.27504 4.0874 4.47504L3.0374 5.52504C2.8124 5.75004 2.7124 6.07504 2.7374 6.42504C2.8874 8.75004 3.8624 11.0125 5.5624 12.7375C7.2624 14.4375 9.5249 15.4375 11.8499 15.5875C12.1999 15.6125 12.5249 15.5125 12.7499 15.2875L13.7999 14.2375C13.9999 14.0375 14.0999 13.7875 14.1249 13.5125C14.1249 13.2375 14.0749 12.9375 13.9249 12.7125L16.1999 14.95Z"
                    fill=""
                  />
                </svg>
              </div>
              <div className="flex flex-1 flex-col">
                <span className="font-medium text-black dark:text-white">
                  Support
                </span>
                <span className="text-sm">david@clustersystems.com</span>
              </div>
            </a>
          </li>
        </ul>
      </div>
    </li>
  );
};

export default DropdownHelp;
