import { X, CheckCircle, XCircle } from "lucide-react";

interface ExplanationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ExplanationModal({ isOpen, onClose }: ExplanationModalProps) {
  if (!isOpen) return null;

  const criteria = [
    { criterion: 'Age', required: '30–65', yourValue: '45', status: 'pass' },
    { criterion: 'HbA1c', required: '> 7.5', yourValue: '8.2', status: 'pass' },
    { criterion: 'Diagnosis', required: 'T2 Diabetes', yourValue: 'T2 Diabetes', status: 'pass' },
    { criterion: 'BMI', required: '22–35', yourValue: '38.1', status: 'fail' },
    { criterion: 'Heart Disease', required: 'None', yourValue: 'Confirmed', status: 'pass' },
    { criterion: 'Metformin', required: 'Required', yourValue: 'Yes', status: 'pass' }
  ];

  return (
    <div 
      className="fixed inset-0 flex items-center justify-center z-50 px-6"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(4px)'
      }}
      onClick={onClose}
    >
      <div 
        className="w-full max-w-3xl p-8 relative"
        style={{
          backgroundColor: '#1e293b',
          borderRadius: '8px',
          border: '1px solid #334155',
          boxShadow: '0 8px 48px rgba(0, 0, 0, 0.6)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h2 
                style={{ 
                  fontFamily: 'Syne, sans-serif',
                  fontWeight: 700,
                  fontSize: '22px',
                  color: '#f1f5f9',
                  marginBottom: '8px'
                }}
              >
                Eligibility Breakdown
              </h2>
              <p style={{ color: '#00e5cc', fontSize: '14px' }}>
                Diabetes Glucose Control Study — T001
              </p>
            </div>
            <button
              onClick={onClose}
              className="hover:opacity-70 transition-opacity"
              style={{ color: '#94a3b8' }}
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Criteria Table */}
        <div 
          className="mb-6 rounded-lg overflow-hidden"
          style={{ border: '1px solid #334155' }}
        >
          <table className="w-full">
            <thead>
              <tr style={{ backgroundColor: '#0f172a' }}>
                <th className="text-left p-3" style={{ color: '#94a3b8', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Criterion
                </th>
                <th className="text-left p-3" style={{ color: '#94a3b8', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Required
                </th>
                <th className="text-left p-3" style={{ color: '#94a3b8', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Your Value
                </th>
                <th className="text-left p-3" style={{ color: '#94a3b8', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {criteria.map((row, i) => (
                <tr 
                  key={i}
                  style={{
                    backgroundColor: i % 2 === 0 ? '#1e293b' : '#0f172a',
                    borderTop: '1px solid #334155'
                  }}
                >
                  <td className="p-3" style={{ color: '#f1f5f9' }}>{row.criterion}</td>
                  <td className="p-3" style={{ color: '#f1f5f9' }}>{row.required}</td>
                  <td className="p-3" style={{ color: '#f1f5f9' }}>{row.yourValue}</td>
                  <td className="p-3">
                    <div 
                      className="flex items-center justify-center w-8 h-8 rounded-full"
                      style={{
                        backgroundColor: row.status === 'pass' ? 'rgba(52, 211, 153, 0.2)' : 'rgba(248, 113, 113, 0.2)'
                      }}
                    >
                      {row.status === 'pass' ? (
                        <CheckCircle size={18} style={{ color: '#34d399' }} />
                      ) : (
                        <XCircle size={18} style={{ color: '#f87171' }} />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* AI Summary */}
        <div 
          className="p-4 mb-6 flex gap-3"
          style={{
            backgroundColor: '#0f172a',
            borderRadius: '8px',
            borderLeft: '3px solid #00e5cc'
          }}
        >
          <div className="text-2xl">🤖</div>
          <p style={{ color: '#f1f5f9' }}>
            You meet 5 of 6 criteria. Your BMI of 38.1 is above the maximum of 35. You may still apply.
          </p>
        </div>

        {/* Score Breakdown */}
        <div className="mb-6 space-y-3">
          {[
            { label: 'Rule Score:', value: 83, color: '#34d399' },
            { label: 'ML Score:', value: 79, color: '#00e5cc' },
            { label: 'Final Score:', value: 87, color: '#00e5cc', bold: true }
          ].map((score, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-28" style={{ color: score.bold ? '#f1f5f9' : '#94a3b8', fontWeight: score.bold ? 700 : 400 }}>
                {score.label}
              </div>
              <div className="flex-1 h-2 rounded-full" style={{ backgroundColor: '#334155' }}>
                <div 
                  className="h-2 rounded-full transition-all"
                  style={{
                    width: `${score.value}%`,
                    background: score.bold ? 'linear-gradient(90deg, #34d399, #00e5cc)' : score.color
                  }}
                />
              </div>
              <div 
                className="w-12 text-right"
                style={{ 
                  color: score.color,
                  fontWeight: score.bold ? 700 : 400,
                  fontFamily: score.bold ? 'Syne, sans-serif' : 'inherit'
                }}
              >
                {score.value}%
              </div>
            </div>
          ))}
        </div>

        {/* Footer Buttons */}
        <div className="flex justify-between">
          <button
            onClick={onClose}
            className="px-6 py-3 border hover:bg-opacity-10 hover:bg-white transition-all"
            style={{
              borderColor: '#00e5cc',
              color: '#00e5cc',
              borderRadius: '4px'
            }}
          >
            Close
          </button>
          <button
            className="px-8 py-3 hover:opacity-90 transition-opacity"
            style={{
              backgroundColor: '#00e5cc',
              color: '#0f172a',
              borderRadius: '4px',
              fontFamily: 'Syne, sans-serif',
              fontWeight: 700
            }}
          >
            ★ I'm Interested
          </button>
        </div>
      </div>
    </div>
  );
}
