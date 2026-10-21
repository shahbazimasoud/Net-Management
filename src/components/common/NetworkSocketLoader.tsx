import React from 'react';

interface NetworkSocketLoaderProps {
  isEn?: boolean;
  message?: string;
  subMessage?: string;
  compact?: boolean;
}

export const NetworkSocketLoader: React.FC<NetworkSocketLoaderProps> = ({
  isEn = false,
  message,
  subMessage,
  compact = false,
}) => {
  const defaultTitle = isEn ? 'Loading Page...' : 'در حال بارگذاری صفحه...';
  const defaultDesc = isEn
    ? 'Please wait, loading system data and workspace...'
    : 'لطفاً شکیبا باشید، در حال آماده‌سازی و دریافت اطلاعات سامانه...';

  return (
    <div
      id="network-socket-loader"
      className="flex flex-col items-center justify-center select-none"
      dir={isEn ? 'ltr' : 'rtl'}
    >
      <div className="relative flex items-center justify-center">
        <div className="net-pulse-glow" />

        {/* Medium Sized Realistic Ethernet RJ45 Socket */}
        <div className="rj45-socket-casing">
          {/* Port Header: LNK & ACT LEDs */}
          <div className="rj45-header">
            <div className="rj45-led-group">
              <div className="led-link" />
              <span className="rj45-led-label" style={{ color: '#34d399' }}>LNK</span>
            </div>
            <span className="rj45-led-label" style={{ color: '#64748b' }}>10G-PORT</span>
            <div className="rj45-led-group">
              <span className="rj45-led-label" style={{ color: '#fbbf24' }}>ACT</span>
              <div className="led-act" />
            </div>
          </div>

          {/* Socket Cavity */}
          <div className="rj45-cavity">
            <div className="rj45-latch" />

            {/* 8 Gold Pins */}
            <div className="rj45-pins">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((p) => (
                <div key={p} className="rj45-pin" />
              ))}
            </div>

            {/* Inner Data Rail */}
            <div className="rj45-rails">
              <div className="rj45-rail-dot" />
              <div className="rj45-rail-line" />
              <div className="rj45-rail-dot" />
            </div>
          </div>

          {/* Metal Ground Clips */}
          <div className="rj45-clips">
            <div className="rj45-clip" />
            <div className="rj45-clip" />
          </div>
        </div>
      </div>

      {/* Loading Titles & Telemetry Messages */}
      {!compact && (
        <div className="flex flex-col items-center justify-center text-center">
          <div className="net-title">
            <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#38bdf8' }} />
            <span>{message || defaultTitle}</span>
          </div>
          <div className="net-status">
            {subMessage || defaultDesc}
          </div>
          <div className="net-badge">
            <span style={{ color: '#10b981' }}>{isEn ? '● PHY: 1000Base-T' : '● پورت: ۱۰۰۰Base-T'}</span>
            <span>|</span>
            <span style={{ color: '#f59e0b' }}>{isEn ? '● Data Stream Active' : '● جریان فعال داده'}</span>
          </div>
        </div>
      )}
    </div>
  );
};
