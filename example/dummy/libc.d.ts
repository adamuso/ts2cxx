interface Boolean {}
interface CallableFunction {}
interface Function {}
interface IArguments {}
interface NewableFunction {}
interface Number { }
interface Object {}
interface RegExp {}
interface Array<T> {}
interface String {} 

type U8Size = 8;
type U16Size = 16;
type U32Size = 32;
type I8Size = 8;
type I16Size = 16;
type I32Size = 32;
type F32Size = 32;
type F64Size = 64;

type u8 = number & { _size?: U8Size };
type u16 = number & { _size?: U16Size | U8Size };
type u32 = number & { _size?: U32Size | U16Size | U8Size };
type i8 = number & { _size?: I8Size };
type i16 = number & { _size?: I16Size | I8Size };
type i32 = number & { _size?: I32Size | I16Size | I8Size };
type float = number & { _size?: F32Size | I32Size | I16Size | I8Size };
type double = number & { _size?: F64Size | F32Size | I32Size | I16Size | I8Size };

declare function u8(v: number): u8;
declare function u16(v: number): u16;
declare function u32(v: number): u32;
declare function i8(v: number): i8;
declare function i16(v: number): i16;
declare function i32(v: number): i32;
declare function float(v: number): float;
declare function double(v: number): double;

type int = i32;
type usize = u32;

declare function extern_c(name?: string): (x: any) => any;
declare function cpp_namespace(name?: string): (x: any) => any;
declare function struct(): (x: any) => any;

// @ts-expect-error
@extern_c()
declare function sizeof<T>(expr?: T): number;

// @ts-expect-error
@extern_c()
declare function addressof(x: any): number;

// @ts-expect-error
@extern_c()
declare function tscc_allocator_alloc(size: usize): number;

// @ts-expect-error
@cpp_namespace("std")
declare module "cstdio" {
    // @ts-expect-error
    @extern_c()
    function printf(format: string, ...args: (number | string)[]): void;
}