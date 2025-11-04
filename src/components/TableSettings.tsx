type RowType = {
  id: string;
  name: string;
  value: string;
};

type TableSettingsProps = {
  rows: RowType[];
  deleteRow: (id: string) => void;
  editRow: (row: RowType) => void;
};

const TableSettings: React.FC<TableSettingsProps> = ({ rows, deleteRow, editRow }) => {
  return (
    <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
      <div className="px-4 py-6 md:px-6 xl:px-7.5">
        <h4 className="text-xl font-semibold text-black dark:text-white">
          Settings
        </h4>
      </div>

      <div className="grid grid-cols-6 border-t border-stroke px-4 py-4.5 dark:border-strokedark sm:grid-cols-8 md:px-6 2xl:px-7.5">
        <div className="col-span-3 flex items-center">
          <p className="font-medium">Name</p>
        </div>
        <div className="col-span-2 hidden items-center sm:flex">
          <p className="font-medium">Value</p>
        </div>
        <div className="col-span-1 flex items-center">
          <p className="font-medium">Actions</p>
        </div>
      </div>

      {rows.map((row) => (
        <div
          className="grid grid-cols-6 border-t border-stroke px-4 py-4.5 dark:border-strokedark sm:grid-cols-8 md:px-6 2xl:px-7.5"
          key={row.id}
        >
          <div className="col-span-3 flex items-center">
            <p className="text-sm text-black dark:text-white">{row.name}</p>
          </div>
          <div className="col-span-2 hidden items-center sm:flex">
            <p className="text-sm text-black dark:text-white">{row.value}</p>
          </div>
          <div className="col-span-1 flex items-center gap-2">
            <button
              onClick={() => editRow(row)}
              className="hover:text-primary"
            >
              Edit
            </button>
            <button
              onClick={() => deleteRow(row.id)}
              className="hover:text-danger"
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default TableSettings;
