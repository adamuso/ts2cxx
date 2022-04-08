import { printf } from "cstdio";

@struct()
class Vec2 {
    x: i32;
    y: i32;

    constructor(x: i32 = 0, y: i32 = 0) {
        this.x = x;
        this.y = y;
    }

    add(point: Vec2): Vec2 {
        return new Vec2(this.x + point.x, this.y + point.y);
    }

    destructor(): void {

    }
}

class Managed {
    test: int;

    constructor() {
        this.test = 10;
    }
}

// @ts-ignore
@extern_c()
function main(): int {
    const a: i32 = 2;
    const b: int = 3; 
    
    let c: Vec2 = new Vec2(a, b);
    const managed: Managed = new Managed();

    printf("%d", managed.test);

    const x: Vec2 = c.add(new Vec2(10, 10))
        .add(new Vec2(1, 2));

    if (x.x > 2)
    {
        let c: Vec2 = new Vec2(1, 2);
    }

    // const x: Vec2 = c.add(new Vec2(10, 10))
    //     .add(new Vec2(1, 2))
    //     .add(new Vec2(2, 3));


    // const x: Vec2 = c.add(new Vec2(10, 10))
    //     .add(new Vec2(5, 6).add(new Vec2(-4, 8)))
    //     .add(new Vec2(2, 3));

    printf("hello, %d, %d", x.x, sizeof(x));

    return c.x;
}