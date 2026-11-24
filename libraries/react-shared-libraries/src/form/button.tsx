'use client';

import {
  ButtonHTMLAttributes,
  DetailedHTMLProps,
  FC,
  useEffect,
  useRef,
  useState,
} from 'react';
import { clsx } from 'clsx';
const ReactLoading = ({ color = '#fff', width = 20, height = 20 }: { type?: string; color?: string; width?: number; height?: number }) => {
  const size = Math.min(width, height);
  const borderWidth = Math.max(2, Math.round(size / 8));
  return (
    <div
      style={{
        width: size,
        height: size,
        border: `${borderWidth}px solid transparent`,
        borderTopColor: color,
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }}
    />
  );
};
export const Button: FC<
  DetailedHTMLProps<
    ButtonHTMLAttributes<HTMLButtonElement>,
    HTMLButtonElement
  > & {
    secondary?: boolean;
    loading?: boolean;
    innerClassName?: string;
  }
> = ({ children, loading, innerClassName, secondary, ...props }) => {
  const ref = useRef<HTMLButtonElement | null>(null);
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    setHeight(ref.current?.offsetHeight || 40);
  }, []);
  return (
    <button
      {...props}
      type={props.type || 'button'}
      // `pointer-events-none` below stops the mouse and nothing else. A focused
      // button still fires on Enter or Space, because that path never goes
      // through pointer events - so every "loading" button in the app could be
      // submitted again from the keyboard while its request was in flight, and
      // the ones that create something created it twice. Setting the attribute
      // closes that path and is what a screen reader reads. It can only make a
      // button less clickable than it already was.
      disabled={props.disabled || loading}
      ref={ref}
      className={clsx(
        (props.disabled || loading) && 'opacity-50 pointer-events-none',
        `${
          secondary ? 'bg-third' : 'bg-forth text-white'
        } px-[24px] h-[40px] cursor-pointer items-center justify-center flex relative`,
        props?.className
      )}
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <ReactLoading
            type="spin"
            color="#fff"
            width={height! / 2}
            height={height! / 2}
          />
        </div>
      )}
      <div
        className={clsx(
          innerClassName,
          'flex-1 min-w-0 items-center justify-center flex text-center leading-tight',
          loading && 'invisible'
        )}
      >
        {children}
      </div>
    </button>
  );
};
