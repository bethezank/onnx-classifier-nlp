
interface FileUploadCardProps {
  label: string;
  accept: string;
  onChange: (file: File | null) => void;
  fileName?: string;
  iconName: string;
  colorClass: string; // e.g. "blue", "purple", "pink"
}

export const FileUploadCard = ({
  label,
  accept,
  onChange,
  fileName,
  iconName,
  colorClass,
}: FileUploadCardProps) => {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    onChange(file);
  };

  const colorStyles: Record<string, string> = {
    blue: "bg-blue-50 dark:bg-blue-900/20 text-blue-500",
    purple: "bg-purple-50 dark:bg-purple-900/20 text-purple-500",
    pink: "bg-pink-50 dark:bg-pink-900/20 text-pink-500"
  };

  return (
    <>
      <div className="bg-white dark:bg-slate-800/50 p-8 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-xl transition-all text-center space-y-6 flex flex-col justify-between">
        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto ${colorStyles[colorClass] || colorStyles.blue}`}>
          <span className="material-symbols-rounded text-3xl">{iconName}</span>
        </div>

        <div className="flex-1 flex flex-col justify-end">
          <h4 className="font-semibold text-lg mb-4 text-slate-900 dark:text-white">{label}</h4>

          <div className="relative group">
            <input
              type="file"
              accept={accept}
              onChange={handleFileChange}
              className="absolute inset-0 opacity-0 cursor-pointer z-10"
            />
            <div className={`bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-xs ${fileName ? 'text-primary' : 'text-slate-500 dark:text-slate-400'} flex justify-between items-center group-hover:bg-slate-100 dark:group-hover:bg-slate-800 transition-colors`}>
              <span className="font-semibold whitespace-nowrap">Choose File</span>
              <span className="truncate ml-2">{fileName || "No file chosen"}</span>
            </div>
          </div>

        </div>
      </div>
    </>
  );
};
