add 6 + 1;
add x + 1;
fun inc x = add 1 x;

val newX = inc x;

fun mapSum x y = add x y;

fun mapSum5 x = mapSum 5 x;

fun mapSum10 x = mapSum 10 x;